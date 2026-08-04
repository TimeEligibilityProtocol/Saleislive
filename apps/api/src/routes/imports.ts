import { buildProductFromImportRow, computeRowDiff, flagDuplicateSkusInFile } from "@saleis-live/domain";
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
export function importsRouter(): Router {
  const router = Router();

  router.post("/api/imports", upload.single("file"), (req, res) => {
    const brandId = String(req.body?.brandId ?? "");
    const brand = getBrandById(brandId);
    if (!brand) return res.status(400).json({ error: "unknown_brand" });
    if (!req.file) return res.status(400).json({ error: "missing_file" });

    let parsed;
    try {
      parsed = parseSpreadsheet(req.file.buffer, req.file.originalname);
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

    const batch = createBatch({ tenantId: brand.tenantId, brandId: brand.id, fileName: req.file.originalname, rows: diffs });
    res.status(201).json({ batch, mapping: parsed.mapping });
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
