import { Router } from 'express';
import {
  createRuleSchema,
  objectIdSchema,
  ruleQuerySchema,
  ruleTestSchema,
  toggleRuleSchema,
  updateRuleSchema,
  type CreateRuleInput,
  type RuleQuery,
  type RuleTestInput,
  type UpdateRuleInput,
} from '@cns/shared';
import { z } from 'zod';
import { asyncHandler, created, noContent, ok } from '../../common/http.js';
import { validate, validated } from '../../middleware/validate.js';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import * as ruleService from './rule.service.js';
import { testRule } from './rule-test.service.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const ruleRouter: Router = Router();

ruleRouter.use(requireAuth);

ruleRouter.get(
  '/',
  validate(ruleQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { rules, meta } = await ruleService.listRules(
      currentUser(req).id,
      validated<RuleQuery>(req, 'query'),
    );
    ok(res, rules, meta);
  }),
);

ruleRouter.post(
  '/',
  validate(createRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = await ruleService.createRule(currentUser(req).id, validated<CreateRuleInput>(req));
    created(res, rule);
  }),
);

ruleRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await ruleService.getRule(currentUser(req).id, req.params['id'] as string));
  }),
);

ruleRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = await ruleService.updateRule(
      currentUser(req).id,
      req.params['id'] as string,
      validated<UpdateRuleInput>(req),
    );
    ok(res, rule);
  }),
);

/** Separate from PATCH so the list toggle is a single cheap, obvious call. */
ruleRouter.patch(
  '/:id/enabled',
  validate(idParamSchema, 'params'),
  validate(toggleRuleSchema),
  asyncHandler(async (req, res) => {
    const { enabled } = validated<{ enabled: boolean }>(req);
    ok(res, await ruleService.setRuleEnabled(currentUser(req).id, req.params['id'] as string, enabled));
  }),
);

ruleRouter.post(
  '/:id/test',
  validate(idParamSchema, 'params'),
  validate(ruleTestSchema),
  asyncHandler(async (req, res) => {
    const { payload } = validated<RuleTestInput>(req);
    ok(res, await testRule(currentUser(req).id, req.params['id'] as string, payload));
  }),
);

ruleRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await ruleService.deleteRule(currentUser(req).id, req.params['id'] as string);
    noContent(res);
  }),
);
