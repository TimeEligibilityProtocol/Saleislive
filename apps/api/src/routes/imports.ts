import { buildProductFromImportRow, computeRowDiff, flagDuplicateSkusInFile, IntakeMethod, MatchMethod, ParsedImportRow, PhotoTreatment } from "@saleis-live/domain";
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { parseSpreadsheet } from "../lib/importParsing.js";
import { createBatch, getBatch, markCommitted } from "../store/imports.js";
import { getProductBySku, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Excel/CSV import — the standard way products enter the catalogue (see
 * saleis-live-blueprint-v1 §4, and Ola's explicit note that single-photo
 * capture is secondary here, unlike wearto.you). Two-step, staged: POST
 * /api/imports parses the file and returns a row-by-row diff without
 * touching the catalogue; POST /api/imports/:id/commit is the separate,
 * explicit action that actually writes it (blueprint §10 Preview → Commit).
 */
function parseFieldOverrides(raw: unknown): Partial<Record<string, keyof ParsedImportRow>> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function importsRouter(): Router {
  const router = Router();

  /**
   * Screen 03 ("Confirm import mapping") — parses the file and returns
   * just the header→field mapping and a sample row so the merchant can
   * review/override before anything is staged. No batch is created here.
   */
  router.post("/api/imports/preview", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "missing_file" });
    let parsed;
    try {
      parsed = parseSpreadsheet(req.file.buffer, req.file.originalname);
    } catch {
      return res.status(400).json({ error: "unreadable_file" });
    }
    res.json({ headers: parsed.headers, mapping: parsed.mapping, rowCount: parsed.rows.length, exampleRow: parsed.rawRows[0] ?? {} });
  });

  router.post("/api/imports", upload.single("file"), (req, res) => {
    const brandId = String(req.body?.brandId ?? "");
    const brand = getBrandById(brandId);
    if (!brand) return res.status(400).json({ error: "unknown_brand" });
    if (!req.file) return res.status(400).json({ error: "missing_file" });

    // Recorded as merchant intent (screen 02), not executed here — only
    // excel_csv actually runs today; see IntakeMethod's doc comment.
    const intakeMethod = (String(req.body?.intakeMethod ?? "excel_csv") as IntakeMethod) || "excel_csv";
    const photoTreatment: PhotoTreatment[] = (() => {
      const raw = req.body?.photoTreatment;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return list as PhotoTreatment[];
    })();
    // computeRowDiff below always matches by SKU regardless of this choice — see MatchMethod's doc comment.
    const matchMethod = (String(req.body?.matchMethod ?? "sku") as MatchMethod) || "sku";
    // Screen 03's user-picked overrides for headers the alias table missed.
    const fieldOverrides = parseFieldOverrides(req.body?.fieldOverrides);

    let parsed;
    try {
      parsed = parseSpreadsheet(req.file.buffer, req.file.originalname, fieldOverrides);
    } catch {
      return res.status(400).json({ error: "unreadable_file" });
    }
    if (parsed.mapping.missingRequired.length > 0) {
      return res.status(400).json({ error: "missing_required_columns", missingRequired: parsed.mapping.missingRequired });
    }
    if (parsed.rows.length === 0) {
      return res.status(400).json({ error: "empty_file" });
    }

    let diffs = parsed.rows.map((row, i) => computeRowDiff(i + 2 /* header is row 1 */, row, getProductBySku(brand.id, row.sku), brand.currency));
    diffs = flagDuplicateSkusInFile(diffs);

    const batch = createBatch({ tenantId: brand.tenantId, brandId: brand.id, fileName: req.file.originalname, rows: diffs, intakeMethod, photoTreatment, matchMethod });
    res.status(201).json({ batch, mapping: parsed.mapping });
  });

  /**
   * Screen 02's 4 not-yet-processed intake tiles (product photos, ZIP,
   * images-in-spreadsheet, phone/camera) have no file to stage, but the
   * merchant's choice still needs to be real, not just UI state that
   * vanishes on refresh — the AI & Catalogue Center (screen 04) reads
   * these once it exists. A 0-row batch is the same record shape as a
   * real import, just with nothing to commit yet.
   */
  router.post("/api/imports/intent", (req, res) => {
    const brandId = String(req.body?.brandId ?? "");
    const brand = getBrandById(brandId);
    if (!brand) return res.status(400).json({ error: "unknown_brand" });

    const intakeMethod = String(req.body?.intakeMethod ?? "") as IntakeMethod;
    if (!intakeMethod) return res.status(400).json({ error: "missing_intake_method" });
    const photoTreatment: PhotoTreatment[] = (() => {
      const raw = req.body?.photoTreatment;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return list as PhotoTreatment[];
    })();
    const matchMethod = (String(req.body?.matchMethod ?? "sku") as MatchMethod) || "sku";

    const batch = createBatch({ tenantId: brand.tenantId, brandId: brand.id, fileName: "", rows: [], intakeMethod, photoTreatment, matchMethod });
    res.status(201).json({ batch });
  });

  router.get("/api/imports/:id", (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: "not_found" });
    res.json({ batch });
  });

  router.post("/api/imports/:id/commit", (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: "not_found" });
    if (batch.status !== "staged") return res.status(409).json({ error: "already_committed" });

    const brand = getBrandById(batch.brandId);
    if (!brand) return res.status(400).json({ error: "unknown_brand" });

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of batch.rows) {
      if (row.blocking || row.action === "skip") {
        skipped++;
        continue;
      }
      const existing = getProductBySku(brand.id, row.sku);
      const product = buildProductFromImportRow({
        row: row.parsedRow,
        existing,
        tenantId: brand.tenantId,
        brandId: brand.id,
        id: existing?.id ?? `p_${randomUUID()}`,
        fileName: batch.fileName,
        rowNumber: row.rowNumber,
        defaultCurrency: brand.currency,
        now,
      });
      upsertProduct(product);
      if (existing) updated++;
      else created++;
    }

    markCommitted(batch.id);
    res.json({ batch: getBatch(batch.id), summary: { created, updated, skipped } });
  });

  return router;
}
