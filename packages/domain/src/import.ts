/**
 * Import staging model — see blueprint §4 and §10 ("Staging import: plik
 * nigdy nie zapisuje zmian bez etapu Preview → Commit"). An uploaded
 * file always produces an ImportBatch in "staged" status with a row-level
 * diff before anything touches the live catalog; committing is a
 * separate, explicit action.
 */

import { Money } from "./money.js";
import { AiAssistedField, Product, ProductImage } from "./product.js";

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
  /** The raw parsed row, kept so commit() can build/update the Product without re-parsing the file. */
  parsedRow: ParsedImportRow;
}

/**
 * A single spreadsheet row after column mapping, before type coercion.
 * Every value is a raw string (or undefined if the column was absent) —
 * matching, diffing and commit all agree on this shape so parsing stays
 * in one place (the file-format-specific layer in apps/api).
 */
export interface ParsedImportRow {
  sku: string;
  name?: string;
  description?: string;
  category?: string;
  color?: string;
  size?: string;
  material?: string;
  price?: string;
  salePrice?: string;
  currency?: string;
  stock?: string;
  imageUrl?: string;
}

function parseAmountMinor(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function parseStock(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

/**
 * Pure diff computation for one row against the currently-stored product
 * (if any) with the same SKU. No I/O, no cross-row awareness (duplicate
 * SKUs *within* the same file are a batch-level concern — see
 * summarizeImportBatch's caller in apps/api, which scans the full row
 * list before this function ever sees a row).
 */
export function computeRowDiff(rowNumber: number, row: ParsedImportRow, existing: Product | undefined, defaultCurrency: string): ImportRowDiff {
  const warnings: string[] = [];
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (!row.sku || !row.sku.trim()) {
    return { rowNumber, sku: "", action: "conflict", changes, warnings: ["missing_sku"], blocking: true, parsedRow: row };
  }

  const priceMinor = parseAmountMinor(row.price);
  const stock = parseStock(row.stock);
  if (row.price !== undefined && row.price.trim() !== "" && priceMinor === null) warnings.push("invalid_price");
  if (row.stock !== undefined && row.stock.trim() !== "" && stock === null) warnings.push("invalid_stock");
  if (!existing) {
    if (priceMinor === null) warnings.push("missing_price");
    if (stock === null) warnings.push("missing_stock");
  }
  if (!row.imageUrl) warnings.push("missing_image");

  const softField = (key: "name" | "description" | "category" | "color" | "size" | "material", raw: string | undefined) => {
    if (raw === undefined || raw.trim() === "") return;
    const current = existing?.[key]?.value ?? null;
    if (current !== raw) changes[key] = { from: current, to: raw };
  };
  softField("name", row.name);
  softField("description", row.description);
  softField("category", row.category);
  softField("color", row.color);
  softField("size", row.size);
  softField("material", row.material);

  if (priceMinor !== null) {
    const current = existing?.price.amountMinor ?? null;
    if (current !== priceMinor) changes.price = { from: existing?.price ?? null, to: { amountMinor: priceMinor, currency: row.currency ?? defaultCurrency } };
  }
  if (stock !== null) {
    const current = existing?.stock ?? null;
    if (current !== stock) changes.stock = { from: current, to: stock };
  }
  if (row.imageUrl && !existing?.images.some((i) => i.url === row.imageUrl)) {
    changes.images = { from: existing?.images ?? [], to: row.imageUrl };
  }

  const blocking = warnings.some((w) => w === "invalid_price" || w === "invalid_stock" || (!existing && (w === "missing_price" || w === "missing_stock")));
  const action: ImportRowAction = existing ? (Object.keys(changes).length > 0 ? "update" : "skip") : "add";

  return { rowNumber, sku: row.sku.trim(), action: blocking ? "conflict" : action, changes, warnings, blocking, parsedRow: row };
}

/** Marks duplicate SKUs *within one file* as conflicts — call after computeRowDiff for every row in the batch. */
export function flagDuplicateSkusInFile(diffs: ImportRowDiff[]): ImportRowDiff[] {
  const seen = new Map<string, number>();
  for (const d of diffs) {
    if (!d.sku) continue;
    seen.set(d.sku, (seen.get(d.sku) ?? 0) + 1);
  }
  return diffs.map((d) => {
    if (d.sku && (seen.get(d.sku) ?? 0) > 1) {
      return { ...d, action: "conflict" as const, blocking: true, warnings: [...d.warnings, "duplicate_sku_in_file"] };
    }
    return d;
  });
}

function nextField<T>(current: AiAssistedField<T> | undefined, newValue: T | undefined, opts: { sourceReference: string; now: string }): AiAssistedField<T> {
  if (newValue === undefined) {
    // Column absent from this file — preserve whatever is already there (never blank out a manual edit on re-import).
    if (current) return current;
    return { value: null, aiSuggestion: null, sourceType: null, sourceReference: null, confidenceScore: null, verificationState: "unverified", updatedBy: null, updatedAt: null, history: [] };
  }
  const history = current?.value != null && current.updatedAt ? [...current.history, { value: current.value, updatedBy: current.updatedBy ?? "unknown", updatedAt: current.updatedAt }] : current?.history ?? [];
  return {
    value: newValue,
    aiSuggestion: null,
    sourceType: "spreadsheet",
    sourceReference: opts.sourceReference,
    confidenceScore: 1,
    verificationState: "merchant_confirmed",
    updatedBy: "import",
    updatedAt: opts.now,
    history,
  };
}

/**
 * Builds the Product record a committed row should produce — pure, no
 * store access, so apps/api's commit step just calls this per row and
 * writes the result. New products land as "draft" (never auto-publish);
 * updates preserve the existing publish status and manual field edits
 * for any column absent from this file.
 */
export function buildProductFromImportRow(opts: {
  row: ParsedImportRow;
  existing: Product | undefined;
  tenantId: string;
  brandId: string;
  id: string;
  fileName: string;
  rowNumber: number;
  defaultCurrency: string;
  now: string;
}): Product {
  const { row, existing, tenantId, brandId, id, fileName, rowNumber, defaultCurrency, now } = opts;
  const sourceReference = `row ${rowNumber} of ${fileName}`;
  const priceMinor = parseAmountMinor(row.price);
  const stock = parseStock(row.stock);
  const price: Money = priceMinor !== null ? { amountMinor: priceMinor, currency: row.currency ?? defaultCurrency } : existing?.price ?? { amountMinor: 0, currency: defaultCurrency };
  const images: ProductImage[] = row.imageUrl && !existing?.images.some((i) => i.url === row.imageUrl) ? [...(existing?.images ?? []), { url: row.imageUrl, alt: row.name ?? row.sku, isMain: (existing?.images.length ?? 0) === 0 }] : existing?.images ?? [];

  return {
    id,
    tenantId,
    brandId,
    sku: row.sku.trim(),
    status: existing?.status ?? "draft",
    name: nextField(existing?.name, row.name, { sourceReference, now }),
    description: nextField(existing?.description, row.description, { sourceReference, now }),
    category: nextField(existing?.category, row.category, { sourceReference, now }),
    color: nextField(existing?.color, row.color, { sourceReference, now }),
    size: nextField(existing?.size, row.size, { sourceReference, now }),
    material: nextField(existing?.material, row.material, { sourceReference, now }),
    images,
    price,
    salePrice: price,
    stock: stock ?? existing?.stock ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** True if every critical field a published product needs is present and trustworthy. */
export function isProductReadyToPublish(product: Product): boolean {
  return product.price.amountMinor > 0 && product.stock >= 0 && product.images.length > 0 && product.name.value != null;
}

export type ImportBatchStatus = "staged" | "committed" | "rolled_back";

/** The 6 "Add stock" source tiles from the approved screen 02 mockup. Only "excel_csv" and "manual" run for real today — the rest are captured as merchant intent for the AI & Catalogue Center (screen 04) to pick up once that phase exists; see photoTreatment below for the same pattern. */
export type IntakeMethod = "excel_csv" | "product_photos" | "photo_zip" | "images_in_spreadsheet" | "manual" | "phone_camera";

/** What the merchant asked screen 02 to do to their product photos — recorded as intent, executed later by the AI pipeline (screen 04), never silently assumed done. */
export type PhotoTreatment = "use_as_supplied" | "quality_check" | "crop_resize" | "remove_background" | "branded_background";

/** How screen 02 was told to match photos to products. Only "sku" is actually implemented — computeRowDiff always matches by SKU regardless of this choice; the others are recorded as a Phase 2 preference for the AI & Catalogue Center. */
export type MatchMethod = "sku" | "ean" | "filename" | "ai_suggest";

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
  intakeMethod: IntakeMethod;
  photoTreatment: PhotoTreatment[];
  matchMethod: MatchMethod;
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
