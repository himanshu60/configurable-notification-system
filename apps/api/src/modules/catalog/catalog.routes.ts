import { Router } from 'express';
import {
  CONDITION_OPERATORS,
  NOTIFICATION_CHANNELS,
  OPERATORS_BY_FIELD_TYPE,
  OPERATOR_LABELS,
  RECIPIENT_TYPES,
} from '@cns/shared';
import { ok } from '../../common/http.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { AVAILABLE_FORMATTERS } from '../../engine/template-renderer.js';
import { EVENT_CATALOG } from './event-catalog.js';

export const catalogRouter: Router = Router();

catalogRouter.use(requireAuth);

/** Everything the rule editor needs to build itself, in one round trip. */
catalogRouter.get('/events', (_req, res) => {
  ok(res, {
    events: EVENT_CATALOG,
    operators: CONDITION_OPERATORS.map((operator) => ({
      value: operator,
      label: OPERATOR_LABELS[operator],
    })),
    operatorsByFieldType: OPERATORS_BY_FIELD_TYPE,
    channels: NOTIFICATION_CHANNELS,
    recipientTypes: RECIPIENT_TYPES,
    templateFormatters: AVAILABLE_FORMATTERS,
  });
});
