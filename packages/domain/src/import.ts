/**
 * Import staging model — see blueprint §4 and §10 ("Staging import: plik
 * nigdy nie zapisuje zmian bez etapu Preview → Commit"). An uploaded
 * file always produces an ImportBatch in "staged" status with a row-level
 * diff before anything touches the live catalog; committing is a
 * separate, explicit action.
 */

export type ImportRowAction = "add" | "update" | "skip" | "archive" | "conflict";

export interface ImportRowDiff {
  rowNumber: number;
  sku: string;
  action: ImportRowAction;
  /** What would change, field by field — shown to the merchandiser before commit. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** Non-blocking issues (e.g. missing optional column) vs. blocking ones (e.g. duplicate SKU in the same file). */
  warnings: string[];
  blocking: boolean;
}

export type ImportBatchStatus = "staged" | "committed" | "rolled_back";

export interface ImportBatch {
  id: string;
  tenantId: string;
  brandId: string;
  fileName: string;
  status: ImportBatchStatus;
  rows: ImportRowDiff[];
  createdAt: string;
  committedAt: string | null;
  /** A committed batch can be rolled back once — this is the batch it reverts to the pre-commit state of. */
  rollbackOfBatchId: string | null;
}

export function summarizeImportBatch(batch: ImportBatch): {
  ready: number;
  needsReview: number;
  missingImage: number;
  conflicts: number;
} {
  return {
    ready: batch.rows.filter((r) => !r.blocking && r.warnings.length === 0).length,
    needsReview: batch.rows.filter((r) => !r.blocking && r.warnings.length > 0).length,
    missingImage: batch.rows.filter((r) => r.warnings.includes("missing_image")).length,
    conflicts: batch.rows.filter((r) => r.action === "conflict").length,
  };
}
