import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { ruleRouter } from './modules/rules/rule.routes.js';
import { eventRouter } from './modules/events/event.routes.js';
import { deliveryRouter } from './modules/deliveries/delivery.routes.js';

/**
 * Aggregates every versioned module router. Mounted at `/api/v1` by `createApp`.
 */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/rules', ruleRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/notifications', deliveryRouter);
