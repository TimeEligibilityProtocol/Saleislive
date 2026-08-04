import { ImportBatch } from "@saleis-live/domain";
import { randomUUID } from "node:crypto";

/**
 * In-memory only, same pragmatic starting point as products.ts/tenants.ts.
 * A batch is "staged" the moment a file is parsed — nothing touches the
 * live catalogue until an explicit commit (blueprint §10 Preview → Commit).
 */
let batches: ImportBatch[] = [];

export function createBatch(input: Omit<ImportBatch, "id" | "status" | "createdAt" | "committedAt" | "rollbackOfBatchId">): ImportBatch {
  const batch: ImportBatch = {
    ...input,
    id: `imp_${randomUUID()}`,
    status: "staged",
    createdAt: new Date().toISOString(),
    committedAt: null,
    rollbackOfBatchId: null,
  };
  batches = [...batches, batch];
  return batch;
}

export function getBatch(id: string): ImportBatch | undefined {
  return batches.find((b) => b.id === id);
}

export function markCommitted(id: string): ImportBatch | undefined {
  const batch = getBatch(id);
  if (!batch) return undefined;
  batch.status = "committed";
  batch.committedAt = new Date().toISOString();
  return batch;
}

export function listBatchesForBrand(brandId: string): ImportBatch[] {
  return batches.filter((b) => b.brandId === brandId);
}
