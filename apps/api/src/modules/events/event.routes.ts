import { Router } from 'express';
import { z } from 'zod';
import {
  eventQuerySchema,
  ingestEventSchema,
  objectIdSchema,
  type EventQuery,
  type IngestEventInput,
} from '@cns/shared';
import { asyncHandler, created, ok } from '../../common/http.js';
import { validate, validated } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as eventService from './event.service.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const eventRouter: Router = Router();

eventRouter.use(requireAuth);

/**
 * Ingestion endpoint. Accepts `Idempotency-Key` as an alternative to
 * `body.eventId` so standard HTTP clients can be idempotent without changing
 * their payload shape.
 */
eventRouter.post(
  '/',
  validate(ingestEventSchema),
  asyncHandler(async (req, res) => {
    const input = validated<IngestEventInput>(req);
    const headerKey = req.header('idempotency-key');

    const result = await eventService.ingestEvent({
      ...input,
      ...(input.eventId ? {} : headerKey ? { eventId: headerKey } : {}),
    });

    // 200 rather than 201 for a duplicate: nothing new was created.
    if (result.duplicate) {
      ok(res, result);
      return;
    }
    created(res, result);
  }),
);

eventRouter.get(
  '/',
  validate(eventQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { events, meta } = await eventService.listEvents(validated<EventQuery>(req, 'query'));
    ok(res, events, meta);
  }),
);

eventRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await eventService.getEvent(req.params['id'] as string));
  }),
);
