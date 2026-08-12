import { buildProductFromImportRow, editField, isCatalogueReady, ParsedImportRow, Product } from "@saleis-live/domain";
import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { autoAnalyzeIfNeeded } from "../lib/autoAnalyze.js";
import { readLocalAsset, saveUploadedAsset } from "../lib/assetStorage.js";
import { BACKGROUND_PRESET_KEYS, BACKGROUND_PRESET_META, compositeOntoBackground, removeImageBackground } from "../lib/backgroundRemoval.js";
import { productsToWorkbookBuffer } from "../lib/exportCatalogue.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../store/auditLog.js";
import { deleteProduct, getProductById, getProductBySku, listAllProductsForBrand, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Admin/catalogue view — every product status, unlike the public storefront route which only returns "active". */
export function adminProductsRouter(anthropicClient: Anthropic | null): Router {
  const router = Router();

  router.get(
    "/api/brands/:brandId/products",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      res.json({ products: await listAllProductsForBrand(brand.id) });
    }),
  );

  /**
   * Catalogue Center's "Export" action — the other half of the
   * reconcile-stock-after-a-sale loop (§ conversation with Ola): export,
   * update offline, re-upload through the same Stock Intake import. Must
   * come before /:id below or Express would try to look up a product
   * literally named "export".
   */
  router.get(
    "/api/brands/:brandId/products/export",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      const products = await listAllProductsForBrand(brand.id);
      const buffer = productsToWorkbookBuffer(products);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${brand.slug}-catalogue-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.send(buffer);
    }),
  );

  /**
   * Screen 02's "Add manually" tile — the one non-Excel intake method that's
   * fully real in Phase 1 (see plan's scope decision). Reuses
   * buildProductFromImportRow so a manual add follows the exact same
   * draft-status/history rules as an imported row, just for a single SKU.
   */
  router.post(
    "/api/brands/:brandId/products/manual",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const row = req.body as ParsedImportRow;
      if (!row.sku || !row.sku.trim()) return res.status(400).json({ error: "missing_sku" });

      const existing = await getProductBySku(brand.id, row.sku);
      const now = new Date().toISOString();
      let product = buildProductFromImportRow({
        row,
        existing,
        tenantId: brand.tenantId,
        brandId: brand.id,
        id: existing?.id ?? `p_${randomUUID()}`,
        fileName: "manual entry",
        rowNumber: 1,
        defaultCurrency: brand.currency,
        now,
      });
      product = await autoAnalyzeIfNeeded(anthropicClient, product, now);
      await upsertProduct(product);
      res.status(201).json({ product });
    }),
  );

  /**
   * "Product photos" / "phone camera" intake — no spreadsheet at all, just
   * photos. Each file becomes its own draft product: the photo is saved,
   * AI fills in name/category/colour/material/description from what it
   * can see (autoAnalyzeIfNeeded), and price/stock are left at 0 for a
   * human to fill in on Catalogue Center afterward — that's the
   * "system asks for the rest later" half of this intake method, since
   * price and stock are facts no photo can tell us.
   */
  router.post(
    "/api/brands/:brandId/products/from-photos",
    requireAuth,
    photoUpload.array("files", 20),
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return res.status(400).json({ error: "missing_files" });

      const created: Product[] = [];
      for (const file of files) {
        const extension = (file.originalname.split(".").pop() || "jpg").toLowerCase();
        const url = await saveUploadedAsset(file.buffer, extension, "photo-intake");
        const now = new Date().toISOString();
        const sku = `PHOTO-${randomUUID().slice(0, 8).toUpperCase()}`;
        let product = buildProductFromImportRow({
          row: { sku, imageUrl: url },
          existing: undefined,
          tenantId: brand.tenantId,
          brandId: brand.id,
          id: `p_${randomUUID()}`,
          fileName: file.originalname,
          rowNumber: 1,
          defaultCurrency: brand.currency,
          now,
        });
        product = await autoAnalyzeIfNeeded(anthropicClient, product, now);
        await upsertProduct(product);
        created.push(product);
      }
      res.status(201).json({ products: created });
    }),
  );

  router.get(
    "/api/brands/:brandId/products/:id",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      const product = await getProductById(req.params.id);
      if (!product || product.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      res.json({ product });
    }),
  );

  /**
   * Catalogue Center's "Delete" action — a merchant removing one wrong
   * item directly, distinct from /api/imports/:id/rollback which undoes a
   * whole batch. Permanent (no soft-delete/undo here, unlike an import
   * rollback which still has the batch's diff to revert from).
   */
  router.delete(
    "/api/brands/:brandId/products/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      await deleteProduct(existing.id);
      await logAudit({ tenantId: brand.tenantId, brandId: brand.id, userId: req.user!.id, action: "product.deleted", entityType: "product", entityId: existing.id, metadata: { sku: existing.sku } });
      res.status(204).end();
    }),
  );

  /**
   * Screen 05 (Product Studio) — "Save" edits fields and re-derives
   * `status` from isCatalogueReady on every save: a product becomes
   * "active" (visible on the storefront, see listProductsForBrand's
   * filter in store/products.ts) the moment it's actually complete, and
   * drops back to "draft" if a later edit makes it incomplete again.
   * There is deliberately no separate manual "approve" step — a status
   * the merchant can't see anywhere used to require a click that did
   * nothing visible, which is exactly the confusion this replaced (Ola,
   * 2026-08-11: "I don't know where that shows up... I don't understand
   * which ones are accepted"). SKU is deliberately not editable here —
   * it's the stable identity re-imports match on (blueprint §4), changing
   * it is a delete+recreate, not an edit.
   */
  router.patch(
    "/api/brands/:brandId/products/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });

      const body = req.body as Partial<{
        name: string;
        description: string;
        category: string;
        color: string;
        size: string;
        material: string;
        dimensions: string;
        price: number;
        salePrice: number;
        stock: number;
      }>;
      const now = new Date().toISOString();
      const editOpts = { updatedBy: "product_studio", now };

      const edited = {
        ...existing,
        name: body.name !== undefined ? editField(existing.name, body.name, editOpts) : existing.name,
        description: body.description !== undefined ? editField(existing.description, body.description, editOpts) : existing.description,
        category: body.category !== undefined ? editField(existing.category, body.category, editOpts) : existing.category,
        color: body.color !== undefined ? editField(existing.color, body.color, editOpts) : existing.color,
        size: body.size !== undefined ? editField(existing.size, body.size, editOpts) : existing.size,
        material: body.material !== undefined ? editField(existing.material, body.material, editOpts) : existing.material,
        dimensions: body.dimensions !== undefined ? editField(existing.dimensions, body.dimensions, editOpts) : existing.dimensions,
        price: body.price !== undefined ? { amountMinor: Math.round(body.price * 100), currency: existing.price.currency } : existing.price,
        salePrice: body.salePrice !== undefined ? { amountMinor: Math.round(body.salePrice * 100), currency: existing.salePrice.currency } : existing.salePrice,
        stock: body.stock !== undefined ? body.stock : existing.stock,
        updatedAt: now,
      };
      const wasActive = existing.status === "active";
      const nextStatus: Product["status"] = existing.status === "archived" ? "archived" : isCatalogueReady(edited) ? "active" : "draft";
      const updated = { ...edited, status: nextStatus };
      await upsertProduct(updated);
      if (updated.status === "active" && !wasActive) {
        await logAudit({ tenantId: brand.tenantId, brandId: brand.id, userId: req.user!.id, action: "product.published", entityType: "product", entityId: updated.id, metadata: { sku: updated.sku } });
      }
      if (body.price !== undefined || body.salePrice !== undefined) {
        await logAudit({ tenantId: brand.tenantId, brandId: brand.id, userId: req.user!.id, action: "product.price_changed", entityType: "product", entityId: updated.id, metadata: { price: updated.price, salePrice: updated.salePrice } });
      }
      res.json({ product: updated });
    }),
  );

  /**
   * "Remove background" — real local segmentation (no external API), ported
   * from Cirka's apps/api/src/routes/backgroundRemoval.ts. Adds the cutout
   * as a NEW image rather than replacing the original, same reasoning as
   * every other photo action here: never destroy what the merchant already
   * has, they choose which version becomes the main photo.
   */
  router.post(
    "/api/brands/:brandId/products/:id/images/remove-background",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      const { url } = req.body as { url?: string };
      const source = existing.images.find((i) => i.url === url);
      if (!source) return res.status(400).json({ error: "unknown_image" });

      const asset = await readLocalAsset(source.url);
      if (!asset) return res.status(422).json({ error: "image_unavailable" });

      try {
        const cutout = await removeImageBackground(asset.buffer, asset.mimetype);
        const cutoutUrl = await saveUploadedAsset(cutout, "png", "cutout");
        const image = { url: cutoutUrl, alt: `${source.alt} (background removed)`, isMain: false };
        const updated = { ...existing, images: [...existing.images, image], updatedAt: new Date().toISOString() };
        await upsertProduct(updated);
        res.status(201).json({ product: updated });
      } catch (err) {
        if (err instanceof Error && err.message === "no_product_detected") return res.status(422).json({ error: "no_product_detected" });
        console.error("remove-background failed:", err);
        res.status(500).json({ error: "processing_failed" });
      }
    }),
  );

  /** Keeps a caller-supplied 0-1 fraction inside a sane range regardless of what the client sends — a wild value would otherwise feed straight into sharp's canvas maths below. */
  function clampFraction(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** "Branded background" — composites an already-removed cutout onto a flat brand-colour backdrop, one of the real photographed scene backgrounds, or a merchant-uploaded custom background (see POST .../backgrounds below), at a caller-chosen position/scale. */
  router.post(
    "/api/brands/:brandId/products/:id/images/apply-background",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      const { url, preset, customBackgroundUrl, offsetX, offsetY, scale } = req.body as {
        url?: string;
        preset?: string;
        customBackgroundUrl?: string;
        offsetX?: number;
        offsetY?: number;
        scale?: number;
      };
      const source = existing.images.find((i) => i.url === url);
      if (!source) return res.status(400).json({ error: "unknown_image" });
      if (!customBackgroundUrl && (!preset || !BACKGROUND_PRESET_KEYS.includes(preset))) return res.status(400).json({ error: "unknown_preset" });

      const asset = await readLocalAsset(source.url);
      if (!asset) return res.status(422).json({ error: "image_unavailable" });

      const options = {
        offsetX: clampFraction(offsetX, 0.5, 0.05, 0.95),
        offsetY: clampFraction(offsetY, 0.5, 0.05, 0.95),
        // Upper bound is intentionally generous (not capped at "fits inside the frame") — Ola wants to be able to zoom a product past the canvas on purpose for a detail shot, matching the admin preview's own clamp.
        scale: clampFraction(scale, 0.72, 0.15, 3),
        customBackgroundUrl,
      };
      const composited = await compositeOntoBackground(asset.buffer, preset ?? "white", options);
      const compositedUrl = await saveUploadedAsset(composited, "png", "branded");
      const label = customBackgroundUrl ? "custom background" : `${preset} background`;
      const image = { url: compositedUrl, alt: `${source.alt} (${label})`, isMain: false };
      const updated = { ...existing, images: [...existing.images, image], updatedAt: new Date().toISOString() };
      await upsertProduct(updated);
      res.status(201).json({ product: updated });
    }),
  );

  /** Merchant-uploaded custom background — saved exactly like a product photo, then addressable by URL from apply-background's customBackgroundUrl. */
  router.post(
    "/api/brands/:brandId/backgrounds",
    requireAuth,
    photoUpload.single("file"),
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      if (!req.file) return res.status(400).json({ error: "missing_file" });
      const extension = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const url = await saveUploadedAsset(req.file.buffer, extension, "custom-bg");
      res.status(201).json({ url });
    }),
  );

  router.get("/api/background-presets", (_req, res) => res.json({ presets: BACKGROUND_PRESET_META }));

  /** Product Studio's "add another photo" — a product can have several images, not just the one main shot from import. New photos land at the end of the gallery, not main, unless it's the very first photo the product has. */
  router.post(
    "/api/brands/:brandId/products/:id/images",
    requireAuth,
    photoUpload.single("file"),
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      if (!req.file) return res.status(400).json({ error: "missing_file" });

      const extension = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const url = await saveUploadedAsset(req.file.buffer, extension, "product");
      const image = { url, alt: existing.name.value ?? existing.sku, isMain: existing.images.length === 0 };
      const now = new Date().toISOString();
      let updated = { ...existing, images: [...existing.images, image], updatedAt: now };
      // Only runs the vision call when this photo just became the main one and the product has no description yet — see autoAnalyzeIfNeeded's doc comment.
      updated = await autoAnalyzeIfNeeded(anthropicClient, updated, now);
      await upsertProduct(updated);
      res.status(201).json({ product: updated });
    }),
  );

  /** Sets which photo shows first on the storefront listing card. */
  router.patch(
    "/api/brands/:brandId/products/:id/images/main",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      const { url } = req.body as { url?: string };
      if (!url || !existing.images.some((i) => i.url === url)) return res.status(400).json({ error: "unknown_image" });

      const images = existing.images.map((i) => ({ ...i, isMain: i.url === url }));
      const updated = { ...existing, images, updatedAt: new Date().toISOString() };
      await upsertProduct(updated);
      res.json({ product: updated });
    }),
  );

  /** Removing a photo — the last one can't be removed if the product needs at least one to publish (isProductReadyToPublish), so this just refuses rather than leaving a product silently unpublishable without saying why. */
  router.delete(
    "/api/brands/:brandId/products/:id/images",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      const { url } = req.body as { url?: string };
      if (!url) return res.status(400).json({ error: "missing_url" });
      if (existing.images.length <= 1) return res.status(409).json({ error: "last_image" });

      const removingMain = existing.images.find((i) => i.url === url)?.isMain;
      const remaining = existing.images.filter((i) => i.url !== url);
      const images = removingMain && remaining.length > 0 ? remaining.map((i, idx) => ({ ...i, isMain: idx === 0 })) : remaining;
      const updated = { ...existing, images, updatedAt: new Date().toISOString() };
      await upsertProduct(updated);
      res.json({ product: updated });
    }),
  );

  return router;
}
