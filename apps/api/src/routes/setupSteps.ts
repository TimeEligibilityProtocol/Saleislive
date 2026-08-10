import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SetupStepKey } from "../generated/prisma/client.js";
import { approveStep, listSetupSteps, rejectStep, SETUP_STEP_ORDER, submitStep } from "../store/setupSteps.js";

function isStepKey(v: string): v is SetupStepKey {
  return (SETUP_STEP_ORDER as string[]).includes(v);
}

/**
 * The setup wizard's steps + approval — see the step naming Ola approved:
 * Brand & Store Setup, Stock Intake, AI Catalogue Review, Launch Setup,
 * Preview & Publish. A step can be submitted by anyone with access to the
 * brand, but only a brand_admin/group_owner can approve or reject it —
 * that's the "several people, one marketplace, steps need sign-off"
 * workflow this whole migration exists for.
 */
export function setupStepsRouter(): Router {
  const router = Router();

  router.get(
    "/api/brands/:brandId/setup-steps",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ steps: await listSetupSteps(req.params.brandId) });
    }),
  );

  router.post(
    "/api/brands/:brandId/setup-steps/:stepKey/submit",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { stepKey } = req.params;
      if (!isStepKey(stepKey)) return res.status(400).json({ error: "invalid_step" });
      const { note } = req.body as { note?: string };
      const result = await submitStep(req.params.brandId, stepKey, req.user!.id, note);
      if ("error" in result) return res.status(409).json(result);
      res.json({ step: result });
    }),
  );

  router.post(
    "/api/brands/:brandId/setup-steps/:stepKey/approve",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      const { stepKey } = req.params;
      if (!isStepKey(stepKey)) return res.status(400).json({ error: "invalid_step" });
      const result = await approveStep(req.params.brandId, stepKey, req.user!.id);
      if ("error" in result) return res.status(409).json(result);
      res.json({ step: result });
    }),
  );

  router.post(
    "/api/brands/:brandId/setup-steps/:stepKey/reject",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      const { stepKey } = req.params;
      if (!isStepKey(stepKey)) return res.status(400).json({ error: "invalid_step" });
      const { note } = req.body as { note?: string };
      if (!note?.trim()) return res.status(400).json({ error: "missing_note" });
      const result = await rejectStep(req.params.brandId, stepKey, req.user!.id, note.trim());
      if ("error" in result) return res.status(409).json(result);
      res.json({ step: result });
    }),
  );

  return router;
}
