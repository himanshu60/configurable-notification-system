import { Router } from 'express';
import { z } from 'zod';
import {
  deliveryQuerySchema,
  inboxQuerySchema,
  objectIdSchema,
  type DeliveryQuery,
  type InboxQuery,
} from '@cns/shared';
import { asyncHandler, ok } from '../../common/http.js';
import { validate, validated } from '../../middleware/validate.js';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import * as deliveryService from './delivery.service.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const deliveryRouter: Router = Router();

deliveryRouter.use(requireAuth);

/** Notification history: everything this user's rules produced. */
deliveryRouter.get(
  '/',
  validate(deliveryQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { deliveries, meta } = await deliveryService.listDeliveries(
      currentUser(req).id,
      validated<DeliveryQuery>(req, 'query'),
    );
    ok(res, deliveries, meta);
  }),
);

/** In-app inbox: everything addressed to this user. Declared before `/:id`. */
deliveryRouter.get(
  '/inbox',
  validate(inboxQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { deliveries, meta, unreadCount } = await deliveryService.listInbox(
      currentUser(req).id,
      validated<InboxQuery>(req, 'query'),
    );
    res.json({ data: deliveries, meta, unreadCount });
  }),
);

deliveryRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    ok(res, await deliveryService.getStats(currentUser(req).id));
  }),
);

deliveryRouter.patch(
  '/inbox/read-all',
  asyncHandler(async (req, res) => {
    ok(res, { updated: await deliveryService.markAllRead(currentUser(req).id) });
  }),
);

deliveryRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await deliveryService.getDelivery(currentUser(req).id, req.params['id'] as string));
  }),
);

deliveryRouter.patch(
  '/:id/read',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await deliveryService.markRead(currentUser(req).id, req.params['id'] as string));
  }),
);

deliveryRouter.post(
  '/:id/retry',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await deliveryService.retryDelivery(currentUser(req).id, req.params['id'] as string));
  }),
);
