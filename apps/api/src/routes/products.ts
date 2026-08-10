import { buildProductFromImportRow, editField, ParsedImportRow } from "@saleis-live/domain";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { productsToWorkbookBuffer } from "../lib/exportCatalogue.js";
import { getProductById, getProductBySku, listAllProductsForBrand, upsertProduct } from "../store/products.js";
import { getBrandById } from "../store/tenants.js";

/** Admin/catalogue view — every product status, unlike the public storefront route which only returns "active". */
export function adminProductsRouter(): Router {
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
      const product = buildProductFromImportRow({
        row,
        existing,
        tenantId: brand.tenantId,
        brandId: brand.id,
        id: existing?.id ?? `p_${randomUUID()}`,
        fileName: "manual entry",
        rowNumber: 1,
        defaultCurrency: brand.currency,
        now: new Date().toISOString(),
      });
      await upsertProduct(product);
      res.status(201).json({ product });
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
   * Screen 05 (Product Studio) — "Save" edits fields without touching
   * status; "Approve" (approve: true) also flips status to "active",
   * which is what makes a product visible on the storefront (see
   * listProductsForBrand's filter in store/products.ts). SKU is
   * deliberately not editable here — it's the stable identity re-imports
   * match on (blueprint §4), changing it is a delete+recreate, not an edit.
   */
  router.patch(
    "/api/brands/:brandId/products/:id",
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
        material: string;
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
        material: body.material !== undefined ? editField(existing.material, body.material, editOpts) : existing.material,
        price: body.price !== undefined ? { amountMinor: Math.round(body.price * 100), currency: existing.price.currency } : existing.price,
        salePrice: body.salePrice !== undefined ? { amountMinor: Math.round(body.salePrice * 100), currency: existing.salePrice.currency } : existing.salePrice,
        stock: body.stock !== undefined ? body.stock : existing.stock,
        status: body.approve ? ("active" as const) : existing.status,
        updatedAt: now,
      };
      await upsertProduct(updated);
      res.json({ product: updated });
    }),
  );

  return router;
}
