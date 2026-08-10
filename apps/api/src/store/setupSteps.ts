import { prisma } from "../lib/prisma.js";
import { BrandSetupStep as PrismaBrandSetupStep, SetupStepKey, SetupStepStatus } from "../generated/prisma/client.js";

/**
 * The 5-step brand setup wizard Ola specified — see the step-name
 * decision in conversation: Brand & Store Setup, Stock Intake, AI
 * Catalogue Review, Launch Setup, Preview & Publish. Order here is the
 * order they must be completed in; step N+1 stays locked until step N
 * is "approved" (see roleAtLeast/requireRole in the route layer for who's
 * senior enough to approve).
 */
export const SETUP_STEP_ORDER: SetupStepKey[] = ["brand_setup", "stock_intake", "ai_catalogue_review", "launch_setup", "preview_publish"];

export interface SetupStepView {
  stepKey: SetupStepKey;
  status: SetupStepStatus;
  submittedByUserId: string | null;
  submittedAt: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  note: string | null;
  /** True once every step before this one is approved — the route layer still re-checks server-side before accepting a submit/approve, this is just what the UI uses to grey out steps. */
  unlocked: boolean;
}

function toView(row: PrismaBrandSetupStep | undefined, stepKey: SetupStepKey, unlocked: boolean): SetupStepView {
  return {
    stepKey,
    status: row?.status ?? "not_started",
    submittedByUserId: row?.submittedByUserId ?? null,
    submittedAt: row?.submittedAt ? row.submittedAt.toISOString() : null,
    approvedByUserId: row?.approvedByUserId ?? null,
    approvedAt: row?.approvedAt ? row.approvedAt.toISOString() : null,
    note: row?.note ?? null,
    unlocked,
  };
}

/** Always returns all 5 steps in order, synthesizing "not_started" for any that have no row yet — callers never need to know the difference between "not started" and "no row exists". */
export async function listSetupSteps(brandId: string): Promise<SetupStepView[]> {
  const rows = await prisma.brandSetupStep.findMany({ where: { brandId } });
  const byKey = new Map(rows.map((r) => [r.stepKey, r]));

  const views: SetupStepView[] = [];
  let priorApproved = true;
  for (const key of SETUP_STEP_ORDER) {
    const row = byKey.get(key);
    views.push(toView(row, key, priorApproved));
    priorApproved = row?.status === "approved";
  }
  return views;
}

async function getStepUnlocked(brandId: string, stepKey: SetupStepKey): Promise<boolean> {
  const idx = SETUP_STEP_ORDER.indexOf(stepKey);
  if (idx === 0) return true;
  const priorKey = SETUP_STEP_ORDER[idx - 1];
  const prior = await prisma.brandSetupStep.findUnique({ where: { brandId_stepKey: { brandId, stepKey: priorKey } } });
  return prior?.status === "approved";
}

export async function submitStep(brandId: string, stepKey: SetupStepKey, userId: string, note?: string): Promise<SetupStepView | { error: "locked" }> {
  if (!(await getStepUnlocked(brandId, stepKey))) return { error: "locked" };
  const row = await prisma.brandSetupStep.upsert({
    where: { brandId_stepKey: { brandId, stepKey } },
    update: { status: "submitted", submittedByUserId: userId, submittedAt: new Date(), note: note ?? null },
    create: { brandId, stepKey, status: "submitted", submittedByUserId: userId, submittedAt: new Date(), note: note ?? null },
  });
  return toView(row, stepKey, true);
}

export async function approveStep(brandId: string, stepKey: SetupStepKey, userId: string): Promise<SetupStepView | { error: "not_submitted" }> {
  const existing = await prisma.brandSetupStep.findUnique({ where: { brandId_stepKey: { brandId, stepKey } } });
  if (existing?.status !== "submitted") return { error: "not_submitted" };
  const row = await prisma.brandSetupStep.update({
    where: { brandId_stepKey: { brandId, stepKey } },
    data: { status: "approved", approvedByUserId: userId, approvedAt: new Date() },
  });
  return toView(row, stepKey, true);
}

export async function rejectStep(brandId: string, stepKey: SetupStepKey, userId: string, note: string): Promise<SetupStepView | { error: "not_submitted" }> {
  const existing = await prisma.brandSetupStep.findUnique({ where: { brandId_stepKey: { brandId, stepKey } } });
  if (existing?.status !== "submitted") return { error: "not_submitted" };
  const row = await prisma.brandSetupStep.update({
    where: { brandId_stepKey: { brandId, stepKey } },
    data: { status: "rejected", approvedByUserId: userId, approvedAt: new Date(), note },
  });
  return toView(row, stepKey, true);
}
