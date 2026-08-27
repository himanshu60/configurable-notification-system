# Notify — Configurable Notification System

A production-shaped notification platform where users define **when** they want to be notified
(an event plus conditions) and **how** (channels, recipients and a message template).

Fire `order.created` with `order.value = 15000`, and a rule that says *notify me when order value
is over $10,000* produces the notification — rendered, queued, delivered and recorded.

---

## Contents

- [What it does](#what-it-does)
- [How a notification actually happens](#how-a-notification-actually-happens)
- [Tech stack](#tech-stack)
- [Setup](#setup)
- [See it work in 60 seconds](#see-it-work-in-60-seconds)
- [Demonstrating the failure paths](#demonstrating-the-failure-paths)
- [Testing](#testing)
- [API reference](#api-reference)
- [Project layout](#project-layout)
- [Assignment requirements and where each is met](#assignment-requirements-and-where-each-is-met)
- [Architecture and key decisions](#architecture-and-key-decisions)
- [What I would improve before production](#what-i-would-improve-before-production)

---

## What it does

**Create and manage notification rules.** A rule has a name, a trigger, a set of conditions
combined with AND/OR, one or more recipients, one or more channels, a message template, and an
enable/disable switch. Rules are per-user and validated against the event catalog on save.

**Two notification channels.** Email (a mock SMTP provider with configurable latency and failure
rate) and In-app (an inbox with unread counts). Both sit behind one adapter interface, so adding
SMS or Slack is one file plus one registry line.

**Trigger an event.** `POST /api/v1/events` runs the real ingestion path: match rules, resolve
recipients, render templates, queue deliveries. The UI's **Simulator** screen uses this exact
endpoint — nothing about the demo is faked.

**View notification history.** Every delivery is recorded with its notification, recipient,
channel, status and timestamp, filterable, with a detail drawer showing attempts, the rendered
body, the provider message id and the last error.

---

## How a notification actually happens

This is the whole system in one path. Every numbered step maps to a real file.

```
   producer                    API (request thread)                  worker (background)
      │                                │                                     │
      │  POST /api/v1/events           │                                     │
      │  { eventId, type, payload }    │                                     │
      ├───────────────────────────────►│                                     │
      │                                │                                     │
      │              ① insert event, unique index on eventId                 │
      │                 duplicate? ──► return 200 { duplicate: true }        │
      │                                │                                     │
      │              ② load enabled rules for this event type                │
      │              ③ evaluate conditions against the payload               │
      │              ④ resolve recipients (USER / EMAIL / ROLE)              │
      │              ⑤ render subject + body from the template               │
      │              ⑥ insert one PENDING delivery per                       │
      │                 (rule × recipient × channel)                         │
      │                 unique index on dedupeKey suppresses repeats         │
      │                                │                                     │
      │◄───────────────────────────────┤                                     │
      │  201 { matchedRules, deliveriesCreated }                             │
      │                                │                                     │
      │                                │   ⑦ claim one due delivery atomically
      │                                │      findOneAndUpdate PENDING→PROCESSING
      │                                │   ⑧ hand it to the channel adapter  │
      │                                │   ⑨ record the outcome              │
      │                                │      ok    → SENT                   │
      │                                │      fail  → FAILED + backoff retry │
      │                                │      spent → DEAD_LETTER            │
```

| Step | What happens | Where |
|---|---|---|
| ① | Event stored; `eventId` unique index makes ingestion idempotent | [`event.service.ts`](apps/api/src/modules/events/event.service.ts) |
| ② | Enabled rules for the event type, cheapest filter first | [`rule.service.ts`](apps/api/src/modules/rules/rule.service.ts) |
| ③ | Pure condition evaluation, one strategy per operator | [`condition-evaluator.ts`](apps/api/src/engine/condition-evaluator.ts) |
| ④ | `ROLE` fans out to every user holding it | [`recipient-resolver.ts`](apps/api/src/engine/recipient-resolver.ts) |
| ⑤ | `{{order.value \| currency}}` → `$15,000.00`, no eval | [`template-renderer.ts`](apps/api/src/engine/template-renderer.ts) |
| ⑥ | Fan-out into the outbox; duplicates suppressed by unique index | [`rule-matcher.ts`](apps/api/src/engine/rule-matcher.ts), [`dedupe.ts`](apps/api/src/engine/dedupe.ts) |
| ⑦–⑨ | Atomic claim, send, retry with backoff, dead-letter | [`dispatcher.ts`](apps/api/src/worker/dispatcher.ts) |

**The key property:** nothing is sent inside the HTTP request. The caller pays only for database
writes and gets a fast, predictable response. Every interaction with a flaky provider belongs to
the worker, which can retry without the producer knowing or caring.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Angular 22 (standalone, signals, zoneless), Angular Material 3 with a custom theme |
| Backend | Node 20+, Express 5, TypeScript (strict) |
| Database | MongoDB 6+ via Mongoose 9 |
| Validation | Zod 4 schemas shared by both sides |
| Tests | Vitest 4, Supertest |
| Repo | npm workspaces monorepo |

---

## Setup

### Prerequisites

- **Node.js 20.19+** (developed on 24)
- **MongoDB 6+** running locally on `mongodb://127.0.0.1:27017`
  (any connection string works — set `MONGODB_URI`)

### Install and run

```bash
git clone https://github.com/himanshu60/configurable-notification-system.git
cd configurable-notification-system

npm install                 # installs all workspaces and builds @cns/shared

cp .env.example .env        # then set JWT_SECRET to any 32+ character string

npm run seed                # demo user + 5 example rules
npm run dev                 # API on :3000, Angular on :4200
```

Open **http://localhost:4200** and sign in:

| Email | Password |
|---|---|
| `demo@cns.dev` | `Password123!` |

> The `.env` file is git-ignored because it holds a signing secret. `.env.example` is committed
> and lists every variable with a comment explaining what it controls.

### Individual commands

```bash
npm run dev:api        # API only, with the in-process worker
npm run dev:web        # Angular dev server only
npm run build          # build shared, api and web
npm test               # every test suite
npm run test:api       # backend only
npm run test:web       # frontend only
npm run lint           # eslint across the monorepo
npm run typecheck      # tsc --noEmit across all three packages
npm run seed           # reset to demo data
```

---

## See it work in 60 seconds

1. Sign in with the demo account.
2. Go to **Rules**. The seeded rule *High value orders* is the example from the brief:
   trigger `order.created`, condition `Order value > 10000`, channels Email + In-app.
3. Open it. Change the **Field** dropdown and watch the operator list and the value input rebuild
   themselves — a number field offers `>` / `between` with a numeric input, an enum field offers
   `is any of` with a multi-select. All of that comes from the API's event catalog.
4. Click **Run dry run** in the right column. You get the rendered message and a per-condition
   pass/fail breakdown. Nothing is stored or sent.
5. Go to **Simulator**, pick *Order created* (the payload prefills with `order.value: 15000`) and
   click **Fire event**. Two rules match and four notifications are queued.
6. Go to **History**. Four rows, each `Sent`, with recipient, channel, status and timestamp.
   Click any row for the delivery detail drawer.
7. Go to **Inbox**. The in-app notifications addressed to you, with an unread badge.
8. Back in **Simulator**, click **Send duplicate** — the same event id again. The response says
   `duplicate: true`, no rules re-run, and History is unchanged.

---

## Demonstrating the failure paths

The mock email provider fails on demand, so retries and dead-lettering are observable rather than
theoretical.

```bash
# in .env
MOCK_EMAIL_FAILURE_RATE=1
```

Restart the API, fire an event from the Simulator, then watch **History**:

- the row goes `Retrying` with an attempt count and a `Next retry` timestamp
- backoff is exponential with jitter — roughly 2s, 4s, 8s
- after `DELIVERY_MAX_ATTEMPTS` (default 4) it lands on `Failed` (dead letter) with the last error
- open the row and click **Retry delivery** to requeue it with a fresh attempt budget

Set the rate back to `0` before retrying to watch it succeed.

**Notification storms.** Set a rule's *Deduplication window* to 300 seconds. Fire two *different*
events that both match it — the second produces `deliveriesSuppressed: 1` instead of a second
notification.

---

## Testing

```bash
npm test
```

**83 backend tests** across 5 suites. They run against a real MongoDB (`cns-test`, dropped between
runs) rather than an in-memory substitute, because the idempotency and deduplication guarantees
are enforced by unique indexes and by the atomicity of `findOneAndUpdate` — a fake would let those
tests pass without proving anything.

What is actually asserted:

| Area | Examples |
|---|---|
| Condition engine | operator matrix across number/string/boolean/date/array, AND vs OR, `"15000" > 10000` coercion, inclusive `between` with reversed bounds, unknown field paths never throw, prototype-pollution paths refused |
| Template renderer | `{{order.value \| currency}}` → `$15,000.00`, missing tokens reported not leaked, embedded expressions never evaluated |
| Deduplication | key stability, case-insensitive recipients, distinct events collapsing inside a window |
| Backoff | exponential growth, ceiling, floor, jitter spread |
| Validation | every bad field reported at once with its path, unknown trigger, operator/field-type mismatch, template token that no field backs |
| Auth | expired and malformed tokens, identical response for wrong password and unknown account, cross-user rule access returns 404 not 403 |
| Ingestion | the brief's example end to end, disabled rules skipped, fan-out arithmetic, duplicate `eventId`, three concurrent copies of one event producing exactly one delivery, `Idempotency-Key` header |
| Worker | send and record provider id, retry-then-succeed with attempt counting, exhaust budget → dead letter, permanent failure dead-letters immediately without burning retries, three workers never claim the same row, stale lock reclaimed |
| History | the four fields the brief asks for, filters, inbox unread counts, retry rejected on an already-sent notification |

**Frontend tests** cover the condition builder (operator and input-control derivation, operator
repair when the field type changes, list parsing), the HTTP interceptors (token attachment, error
message extraction, 401 session teardown) and the route guards.

---

## API reference

All routes are prefixed `/api/v1` and require `Authorization: Bearer <token>` except
`/auth/register`, `/auth/login` and the health checks.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` · `/auth/login` | Issue a JWT |
| `GET` | `/auth/me` | Current user |
| `GET` | `/catalog/events` | Event types, fields, operators — drives the rule editor |
| `GET` | `/rules` | List with `search`, `eventType`, `channel`, `enabled`, paging, sorting |
| `POST` | `/rules` | Create |
| `GET` `PATCH` `DELETE` | `/rules/:id` | Read, update, delete |
| `PATCH` | `/rules/:id/enabled` | Toggle |
| `POST` | `/rules/:id/test` | Dry run — evaluate and render, no side effects |
| `POST` | `/events` | Idempotent ingestion |
| `GET` | `/events` · `/events/:id` | Event log |
| `GET` | `/notifications` | History with `channel`, `status`, `ruleId`, `from`, `to` |
| `GET` | `/notifications/inbox` | In-app notifications for the current user |
| `PATCH` | `/notifications/:id/read` · `/notifications/inbox/read-all` | Mark read |
| `POST` | `/notifications/:id/retry` | Requeue a dead-lettered delivery |
| `GET` | `/notifications/stats` | Dashboard tiles |
| `GET` | `/health` · `/health/ready` | Liveness and readiness |

**Response shape.** Success is `{ data, meta? }`. Failure is always:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The rule is not valid for the selected trigger",
    "details": [{ "path": "conditions.items.0.operator", "message": "\"contains\" cannot be used with a number field" }],
    "requestId": "0f8c…"
  }
}
```

One error middleware produces every one of these, so the client has exactly one failure shape to
handle and `requestId` ties a user-visible error to a server log line.

### Firing an event by hand

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@cns.dev","password":"Password123!"}' | jq -r .data.token)

curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "order-10241",
    "type": "order.created",
    "payload": {
      "order": { "id": "ORD-10241", "value": 15000, "currency": "USD", "region": "NA", "expedited": true },
      "customer": { "id": "CUST-88", "name": "Acme Industries", "tier": "enterprise" }
    }
  }'
```

Run it twice — the second response says `"duplicate": true` and creates nothing.

---

## Project layout

```
configurable-notification-system/
├─ packages/shared/          @cns/shared — the contract both sides import
│  ├─ domain/                enums, event-catalog types, API envelopes
│  └─ schemas/               zod schemas → inferred TypeScript DTOs
├─ apps/api/
│  ├─ src/config/            zod-validated env, fails fast at boot
│  ├─ src/common/            AppError, response helpers, logger
│  ├─ src/middleware/        auth, validation, error handler, rate limiting
│  ├─ src/modules/           auth · rules · events · deliveries · catalog · health
│  ├─ src/engine/            condition evaluator, renderer, dedupe, matcher
│  ├─ src/channels/          adapter interface + email + in-app + registry
│  ├─ src/worker/            dispatcher, backoff
│  └─ tests/                 unit + integration
└─ apps/web/
   ├─ src/app/core/          API client, interceptors, guards, stores, theme
   ├─ src/app/shared/ui/     page header, empty state, status chip, confirm dialog
   ├─ src/app/layout/        responsive app shell
   ├─ src/app/features/      auth · dashboard · rules · events · notifications
   └─ src/styles/            design tokens
```

Every component is three files — `.ts`, `.html`, `.scss` — in its own folder.

---

## Assignment requirements and where each is met

| Requirement | Where |
|---|---|
| Rule name, trigger, conditions, recipients, channel, template, enable/disable | `rule.model.ts`, rule editor UI |
| At least 2 channels | `email.channel.ts` (mock SMTP), `in-app.channel.ts` |
| Trigger an event → notification generated | `POST /events`, Simulator screen |
| History: notification, recipient, channel, status, timestamp | `delivery.model.ts`, History screen |
| Clean, maintainable code | layered API, no logic in controllers, pure engine |
| Angular component architecture | standalone + signals, lazy routes, OnPush, feature folders, reusable `shared/ui` |
| UI styling and responsiveness | Material 3 custom theme, light/dark, tables → cards under 900px |
| Strong TypeScript | strict + `noUncheckedIndexedAccess`, zod-inferred DTOs shared across the wire, exhaustive `Record` maps |
| Node/API design | versioned prefix, one response envelope, typed error codes, pagination, health checks |
| Reusable and extensible | new channel = 1 file + 1 line; new event type = 1 catalog entry, UI follows |
| Validation and error handling | zod at the edge, catalog-aware semantic validation, single error middleware |
| Testing | 83 backend tests + frontend component/interceptor tests |
| Failures | retries with jittered backoff, dead letters, stale-lock reclaim, graceful shutdown |
| Duplicate events | two layers — unique `eventId`, unique `dedupeKey` with optional time window |
| Scalability | atomic claim means N workers are safe today; outbox maps 1:1 onto a real queue |

---

## Architecture and key decisions

Full reasoning, trade-offs and the state machine diagram are in
**[ARCHITECTURE.md](ARCHITECTURE.md)**. The short version:

- **A monorepo with a shared package** so the API and the client cannot disagree about a DTO. The
  zod schemas are the single source of truth and the TypeScript types are inferred from them.
- **The event catalog is data, not code.** Fields, types and allowed operators live in one
  registry the API serves. The condition builder renders itself from that response, so adding a
  trigger server-side changes the UI with no frontend change.
- **One `deliveries` collection is the outbox, the history and the inbox.** A delivery *is* the
  notification record the brief asks to display; splitting it would mean writing the same row
  twice and keeping two statuses in sync.
- **A Mongo-backed outbox instead of a queue.** No Redis or Kafka to stand up, and the claim
  semantics (atomic status transition, visibility timeout, backoff, dead letter) are the same ones
  a real queue provides — so replacing it touches one file.
- **Signals instead of NgRx.** One small piece of genuinely global state and a few per-feature
  stores. NgRx would add ceremony without adding safety at this size.

---

## What I would improve before production

**Delivery infrastructure.** Replace the polling loop with BullMQ/Redis or Kafka and run the
worker as its own autoscaled process. The adapter and outbox contracts already allow this;
`dispatcher.ts` is the only file that changes. Add a circuit breaker per provider so one degraded
vendor cannot consume the whole worker pool.

**Real channels.** Swap the mock for SES/SendGrid, and add SMS (Twilio), Slack and web push behind
the same interface. Add per-provider credentials in a secrets manager rather than env vars.

**Rule lifecycle.** Versioning and an audit trail (who changed what, when), soft delete, and the
ability to see which rule version produced a historical notification.

**Recipient controls.** Quiet hours, digest batching, per-recipient rate limits and unsubscribe
handling — the things that stop a correct system from becoming a spam source.

**Observability.** OpenTelemetry traces spanning ingest → queue → delivery, Prometheus metrics,
and alerting on dead-letter depth and queue age. `requestId` already threads through the logs;
this would extend it across process boundaries.

**Data lifecycle.** A TTL or archival job on `events` and `deliveries`, cold storage for old
history, and sharding by tenant once volume justifies it.

**Security.** Refresh tokens with rotation, full RBAC rather than the two roles here, per-tenant
API keys for the ingestion endpoint, and a signed-webhook ingestion mode.

**Testing.** Playwright end-to-end coverage of the rule-authoring flow, contract tests between the
shared schemas and the API, and a k6 load profile to establish the real throughput ceiling of the
claim query.

**Frontend.** Virtual scrolling once history outgrows pagination, SSR for first paint, i18n, and a
formal accessibility audit (the components are keyboard-navigable and colour is never the only
signal, but that has not been verified with a screen reader).
