# Architecture and key decisions

This document explains how the system is put together and, more importantly, *why* each choice was
made and what it costs. Setup and usage live in [README.md](README.md).

---

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/web — Angular 22                                               │
│  standalone components · signals · lazy routes · Material 3          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP, one response envelope
┌───────────────────────────────▼──────────────────────────────────────┐
│  packages/shared — @cns/shared                                       │
│  zod schemas → inferred DTOs · enums · operator/field-type matrix     │
│  imported by BOTH sides, so a contract change breaks the build        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  apps/api — Express 5                                                │
│                                                                      │
│   routes ──► middleware ──► service ──► model                        │
│   (HTTP)     (validate,      (business    (Mongoose)                 │
│               auth, errors)   rules)                                 │
│                                  │                                   │
│                                  ▼                                   │
│   engine/      pure, no I/O: evaluator · renderer · dedupe            │
│   channels/    adapter interface + email + in-app + registry          │
│   worker/      dispatcher: claim · send · retry · dead letter         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │    MongoDB     │
                        │ users · rules  │
                        │ events         │
                        │ deliveries     │
                        └────────────────┘
```

**Layering rule:** controllers do HTTP, services do business rules, models do persistence, and the
`engine/` folder is pure functions with no I/O at all. That last part is deliberate — the condition
evaluator, the template renderer and the dedupe key are the parts most likely to be wrong and most
valuable to test, so none of them touch a database.

---

## 2. The shared package is the contract

`@cns/shared` holds zod schemas, and every TypeScript type is *inferred* from them:

```ts
export const createRuleSchema = z.object({ /* … */ });
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
```

The API validates with the schema. The client imports the type. They cannot drift, because there is
only one declaration.

It also holds `OPERATORS_BY_FIELD_TYPE` — which operators are legal for which field type. The API
uses it to reject a bad rule; the condition builder uses it to populate its operator dropdown. If
those two ever disagreed you would get a form that lets you build something the server refuses, so
they share one table.

**Cost:** the shared package must be built before either app compiles. `postinstall` handles it and
`npm run dev` runs it in watch mode, but it is a real step a contributor can trip over.

---

## 3. Data model — four collections

| Collection | Purpose |
|---|---|
| `users` | Account, bcrypt hash (never selected by default), role |
| `rules` | The user's configuration |
| `events` | Every event received, its match result and processing status |
| `deliveries` | The outbox **and** the history **and** the in-app inbox |

### Why deliveries is one collection

A delivery row already carries everything the brief asks the history to show — notification,
recipient, channel, status, timestamp. It is simultaneously:

- the **job** the worker claims (`status`, `attempts`, `nextAttemptAt`, `lockedBy`)
- the **audit record** the History screen lists
- the **inbox item** the in-app channel exposes (`readAt`)

Splitting these into three collections would mean writing the same content two or three times and
keeping their statuses in sync — a class of bug with no upside at this scale.

**Cost:** the row is wider than a pure queue job, and the collection carries both hot (pending) and
cold (historical) documents. In production I would age completed deliveries into a separate archive
collection; the indexes below already keep the hot path off the cold documents.

### Indexes and why each exists

| Index | Why |
|---|---|
| `events.eventId` **unique** | The idempotency guarantee. Not a convention — the database enforces it. |
| `deliveries.dedupeKey` **unique** | The no-duplicate-notification guarantee. |
| `deliveries {status, nextAttemptAt}` | The worker's claim query runs on every poll. |
| `deliveries {status, lockedAt}` | The stale-lock reaper. |
| `deliveries {ownerId, createdAt:-1}` | History's default view. |
| `deliveries {recipient.userId, channel, readAt, createdAt:-1}` | Inbox and unread count. |
| `rules {eventType, enabled, priority}` | Runs for every ingested event. |
| `rules {ownerId, name}` **unique** | Backs the friendly "you already have a rule with that name" conflict. |

---

## 4. Duplicate events — two independent layers

The brief calls this out specifically, and it is genuinely two different problems.

### Layer 1 — the same event arriving twice

At-least-once producers redeliver. `events.eventId` has a unique index, and **the insert is the
claim**:

```ts
try {
  event = await EventModel.create({ eventId, … });   // wins the race
} catch (error) {
  if (isDuplicateKeyError(error)) {
    return { duplicate: true, deliveriesCreated: 0, … };
  }
  throw error;
}
```

This is not a read-then-write check. Two copies of the same event arriving concurrently on two
instances both attempt the insert; exactly one succeeds. A `findOne` followed by a `create` would
have a window between them where both could pass. There is a test that fires three concurrent
copies and asserts exactly one delivery is created.

Producers that cannot generate an id may omit it (the API mints a UUID) or send an
`Idempotency-Key` header instead.

### Layer 2 — a storm of *different* events

Fifty failed payments in a minute are fifty distinct, legitimate events. Notifying fifty times is
still wrong. Each rule has a `dedupeWindowSec`, and the dedupe key changes shape accordingly:

```
dedupeWindowSec = 0   →  sha256(ruleId | channel | recipient | eventId)
dedupeWindowSec > 0   →  sha256(ruleId | channel | recipient | floor(now / window))
```

With a window, every event landing in the same bucket produces the same key, and the unique index
collapses them into one notification. The insert is attempted and the collision is caught and
recorded as suppressed — again, no check-then-act race.

---

## 5. Failure handling

### Nothing is sent inside the request

Ingestion writes the event and its pending deliveries, then returns. The producer never waits on a
provider and never sees a provider's failure. This is the single most important reliability
decision in the system.

### The claim is the lock

```ts
DeliveryModel.findOneAndUpdate(
  { status: { $in: ['PENDING', 'FAILED'] }, nextAttemptAt: { $lte: now } },
  { $set: { status: 'PROCESSING', lockedAt: now, lockedBy: workerId }, $inc: { attempts: 1 } },
  { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
)
```

`findOneAndUpdate` is atomic in MongoDB. Two workers racing for the same row cannot both win — the
loser's filter no longer matches and it moves to the next row. This is what makes the API safe to
run as N replicas with no coordination service, and it is tested with three concurrent claims.

### State machine

```
              ┌──────── retry when nextAttemptAt passes ────────┐
              │                                                 │
              ▼                                                 │
  ┌─────────────┐   claim    ┌────────────┐   provider ok   ┌───┴────┐
  │   PENDING   ├───────────►│ PROCESSING ├────────────────►│  SENT  │
  └─────────────┘            └─────┬──────┘                 └────────┘
        ▲                          │
        │ reaper                   │ provider failed
        │ (visibility timeout)     ▼
        │                    ┌──────────┐  attempts exhausted   ┌─────────────┐
        └────────────────────┤  FAILED  ├──────────────────────►│ DEAD_LETTER │
                             └──────────┘  or permanent failure └──────┬──────┘
                                                                       │
   SUPPRESSED (terminal, never attempted — dedupe collision)      manual retry
                                                                       │
                                                          resets to PENDING
```

**Retryable vs permanent.** An adapter distinguishes them. A malformed address will never succeed,
so it goes straight to `DEAD_LETTER` instead of burning four attempts and twenty seconds of backoff.
A `421 Service not available` is retried.

**Backoff has jitter, and the jitter matters more than the exponent.** Without it, an outage makes
every delivery queued in the same second retry in the same second forever, and the recovery attempt
becomes a second outage.

**Crash recovery.** If a worker dies between claiming and recording, the row is stranded in
`PROCESSING`. A reaper returns anything held past `WORKER_VISIBILITY_TIMEOUT_MS` to `PENDING` — the
same guarantee a real queue's visibility timeout provides.

**Graceful shutdown.** `SIGTERM` stops the polling loop and awaits the in-flight cycle, so a deploy
does not strand work.

---

## 6. Why an outbox instead of a queue

BullMQ or SQS would be the obvious production answer. This uses MongoDB, deliberately:

**For:** no extra infrastructure for a reviewer to stand up. The claim semantics are identical to a
real queue — atomic transition, visibility timeout, backoff, dead letter — so the *design* is the
same one and only the mechanism is simpler.

**Against:** polling has a floor on latency (`WORKER_POLL_INTERVAL_MS`, default 1s) and a cost when
idle. It will not hold up at very high throughput; the claim query becomes a contention point long
before MongoDB itself does.

**Migration path:** `worker/dispatcher.ts` is the only file that changes. The adapter interface, the
delivery model and the fan-out logic are all unaware of how work is scheduled.

---

## 7. Extensibility

### Adding a channel

1. Implement `NotificationChannelAdapter` in `channels/`.
2. Add the literal to `NOTIFICATION_CHANNELS` in `@cns/shared`.
3. Add one line to the registry.

The registry is typed `Record<NotificationChannel, NotificationChannelAdapter>`, so the compiler
points at the file if you do step 2 without step 3. The engine, the worker, the models and the API
need no changes — and neither does the UI, which reads the channel list from the catalog endpoint.

### Adding an event type

Add one entry to `EVENT_CATALOG` with its fields, their types and a sample payload. That is all.

The condition builder derives its field dropdown from the trigger, its operator list from the
selected field's type, and its value control from the operator — a `number` field with `between`
gets a paired numeric range, an `enum` field with `is any of` gets a multi-select. **No frontend
change is required to support a new trigger.** This is the single design decision the UI is built
around, and the component test suite asserts it.

---

## 8. Frontend decisions

**Standalone + signals, no NgRx.** The app has one piece of genuinely global state (the session)
and a few per-feature stores. Signals give the same predictability with far less ceremony. NgRx
would be justified by cross-feature state coordination, time-travel debugging needs, or a larger
team — none of which apply here.

**Zoneless change detection.** Angular 22's `provideZonelessChangeDetection` with `OnPush`
everywhere. Signals drive updates precisely rather than through zone-triggered global checks.

**Everything lazy.** Each feature is a `loadComponent` route, so the initial bundle carries the
shell and the login screen only.

**The catalog is fetched once per session** and cached in a signal, because every rule screen needs
it and it changes only on deploy.

**Typed non-nullable reactive forms** throughout, so `getRawValue()` produces something structurally
assignable to the shared DTO rather than a bag of `string | null`.

**Optimistic rule toggling.** The switch flips locally first and rolls back if the server disagrees,
because a list toggle that waits 200ms feels broken.

**Accessibility is not decorative.** Status is never conveyed by colour alone — every state has a
distinct icon and text label. Focus rings are explicit and global. Tables collapse to cards under
900px rather than scrolling off the viewport.

---

## 9. Validation, in three layers

1. **Shape** — zod at the HTTP edge. Types, ranges, required fields, and the arity rules that
   depend on the operator (`between` needs exactly two values, `exists` needs none).
2. **Semantics** — `rule.validation.ts`, which needs the event catalog: does this trigger exist,
   is this field one of its fields, does this operator suit that field's type, and do all the
   template tokens resolve against the sample payload? That last check catches a typo in a template
   at save time instead of producing a message with a blank in it three days later.
3. **Storage** — Mongoose schema constraints and unique indexes as the final backstop.

Every failure produces the same envelope with a machine-readable `code`, a human `message`, a
`details[]` array of field paths, and the `requestId` that ties it to a server log line. When a
rule update changes only the trigger, the *merged* result is re-validated, not the patch — so
conditions that were valid for the old trigger are correctly rejected for the new one.

---

## 10. Known limitations

Stated plainly, because they are deliberate scope choices rather than oversights:

- **The worker runs in-process** by default. `WORKER_ENABLED=false` splits it out, but there is no
  separate deployable defined.
- **Polling latency floor** of one second between queueing and delivery.
- **The inbox badge polls** every 15 seconds rather than using a websocket or SSE.
- **No rule versioning.** Editing a rule changes it for future events only, and historical
  deliveries record the rule *name* at send time but not the rule *version*.
- **Two roles only** (`ADMIN`, `USER`), with no per-resource permissions.
- **`ROLE` recipients fan out at send time**, so a very large role would produce a very large
  fan-out inside one ingestion request.
- **The email channel is mocked.** It has realistic latency and configurable failure, but no real
  provider is wired up.

The prioritised plan for addressing these is in the README's
[What I would improve before production](README.md#what-i-would-improve-before-production).
