import { buildProductFromImportRow, editField, ParsedImportRow, Product } from "@saleis-live/domain";
import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { autoAnalyzeIfNeeded } from "../lib/autoAnalyze.js";
import { readLocalAsset, saveUploadedAsset } from "../lib/assetStorage.js";
import { BACKGROUND_PRESET_KEYS, compositeOntoBackground, removeImageBackground } from "../lib/backgroundRemoval.js";
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
   * Screen 05 (Product Studio) — "Save" edits fields without touching
   * status; "Approve" (approve: true) also flips status to "active",
   * which is what makes a product visible on the storefront (see
   * listProductsForBrand's filter in store/products.ts). SKU is
   * deliberately not editable here — it's the stable identity re-imports
   * match on (blueprint §4), changing it is a delete+recreate, not an edit.
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
        approve: boolean;
      }>;
      const now = new Date().toISOString();
      const editOpts = { updatedBy: "product_studio", now };

      const updated = {
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
        status: body.approve ? ("active" as const) : existing.status,
        updatedAt: now,
      };
      await upsertProduct(updated);
      if (body.approve) {
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

  /** "Branded background" — composites an already-removed cutout onto a flat brand-colour backdrop. Flat colour presets only (see BACKGROUND_PRESET_KEYS); a generated scene/texture background would need an image-generation API this project doesn't have configured. */
  router.post(
    "/api/brands/:brandId/products/:id/images/apply-background",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const existing = await getProductById(req.params.id);
      if (!existing || existing.brandId !== brand.id) return res.status(404).json({ error: "not_found" });
      const { url, preset } = req.body as { url?: string; preset?: string };
      const source = existing.images.find((i) => i.url === url);
      if (!source) return res.status(400).json({ error: "unknown_image" });
      if (!preset || !BACKGROUND_PRESET_KEYS.includes(preset)) return res.status(400).json({ error: "unknown_preset" });

      const asset = await readLocalAsset(source.url);
      if (!asset) return res.status(422).json({ error: "image_unavailable" });

      const composited = await compositeOntoBackground(asset.buffer, preset);
      const compositedUrl = await saveUploadedAsset(composited, "png", "branded");
      const image = { url: compositedUrl, alt: `${source.alt} (${preset} background)`, isMain: false };
      const updated = { ...existing, images: [...existing.images, image], updatedAt: new Date().toISOString() };
      await upsertProduct(updated);
      res.status(201).json({ product: updated });
    }),
  );

  router.get("/api/background-presets", (_req, res) => res.json({ presets: BACKGROUND_PRESET_KEYS }));

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
