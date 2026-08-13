import { AiAssistedField, approvedField, emptyField, Product, ProductImage } from "@saleis-live/domain";
import { prisma } from "../lib/prisma.js";
import { Prisma, Product as PrismaProduct } from "../generated/prisma/client.js";

/** Prisma's Json input type wants a plain-object-with-index-signature shape, which our domain interfaces (AiAssistedField, ProductImage) don't structurally satisfy even though they're plain JSON at runtime — one cast point instead of one per call site. */
const toJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Persisted in Postgres via Prisma. P001-P006 seeded from
 * SALEIS.LIVE/fictional_product_catalog_EN.xlsx — the spec's own demo
 * catalog, not invented placeholder data. No markup/"was" price is
 * fabricated: the sheet gives one net price, so price === salePrice here
 * (no fake discount on real data). P007 has no xlsx row — Ola asked for a
 * Beauty-category demo item using the spec's own product-07.jpg
 * photography, so its name/price/stock are a reasonable placeholder, same
 * honesty rule (price === salePrice, no fake discount).
 */

/** Rows saved before ProductImage.finish existed have no such field in their stored JSON — inferred here from the same URL prefix saveUploadedAsset always writes (cutout-/branded-/anything else), so old data self-heals on read instead of needing a migration script. */
function normalizeImage(image: ProductImage & { finish?: ProductImage["finish"] }): ProductImage {
  if (image.finish) return image as ProductImage;
  const filename = image.url.split("/").pop() ?? "";
  const finish: ProductImage["finish"] = filename.startsWith("cutout-") ? "cutout" : filename.startsWith("branded-") ? "branded" : "original";
  return { ...image, finish };
}

function toDomainProduct(row: PrismaProduct): Product {
  return {
    id: row.id,
    tenantId: row.tenantId,
    brandId: row.brandId,
    sku: row.sku,
    status: row.status,
    name: row.name as unknown as AiAssistedField<string>,
    description: row.description as unknown as AiAssistedField<string>,
    category: row.category as unknown as AiAssistedField<string>,
    color: row.color as unknown as AiAssistedField<string>,
    size: row.size as unknown as AiAssistedField<string>,
    material: row.material as unknown as AiAssistedField<string>,
    dimensions: row.dimensions as unknown as AiAssistedField<string>,
    images: (row.images as unknown as ProductImage[]).map(normalizeImage),
    price: { amountMinor: row.priceAmountMinor, currency: row.priceCurrency },
    salePrice: { amountMinor: row.salePriceAmountMinor, currency: row.salePriceCurrency },
    stock: row.stock,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureSeedData(): Promise<void> {
  const existing = await prisma.product.count({ where: { brandId: "b_demo" } });
  if (existing > 0) return;

  const base = (
    id: string,
    sku: string,
    name: string,
    category: string,
    color: string,
    size: string,
    material: string,
    priceMinor: number,
    stock: number,
    imageUrl: string,
  ) => ({
    id,
    tenantId: "t_demo",
    brandId: "b_demo",
    sku,
    status: "active" as const,
    name: approvedField(name),
    description: approvedField(`${name} — part of this season's selection.`),
    category: approvedField(category),
    color: approvedField(color),
    size: approvedField(size),
    material: approvedField(material),
    dimensions: emptyField<string>(),
    images: [{ url: imageUrl, alt: name, isMain: true, finish: "original" }] satisfies ProductImage[],
    priceAmountMinor: priceMinor,
    priceCurrency: "AED",
    salePriceAmountMinor: priceMinor,
    salePriceCurrency: "AED",
    stock,
  });

  const seeds = [
    base("P001", "P001", "Pleated Midi Dress", "Clothing", "Cream", "S/M", "Polyester", 34900, 25, "/assets/products/product-01.jpg"),
    base("P002", "P002", "Gold Hoop Earrings", "Jewelry", "Gold", "One Size", "Stainless Steel", 12900, 40, "/assets/products/product-02.jpg"),
    base("P003", "P003", "Two-Tone Slingback Heels", "Shoes", "Cream / Brown", "37–41", "Vegan Leather", 29900, 18, "/assets/products/product-03.jpg"),
    base("P004", "P004", "Leather Loafers", "Shoes", "Dark Brown", "40–44", "Genuine Leather", 39900, 15, "/assets/products/product-04.jpg"),
    base("P005", "P005", "Crescent Shoulder Bag", "Accessories", "Dark Brown", "One Size", "Vegan Leather", 27900, 12, "/assets/products/product-05.jpg"),
    base("P006", "P006", "Sculptural Ceramic Vase", "Home", "Ivory", "One Size", "Ceramic", 15900, 30, "/assets/products/product-08.jpg"),
    base("P007", "P007", "Repair Serum", "Beauty", "Amber", "30ml", "Glass", 18900, 20, "/assets/products/product-07.jpg"),
  ];

  for (const s of seeds) {
    await prisma.product.create({
      data: { ...s, name: toJson(s.name), description: toJson(s.description), category: toJson(s.category), color: toJson(s.color), size: toJson(s.size), material: toJson(s.material), dimensions: toJson(s.dimensions), images: toJson(s.images) },
    });
  }
}

/** Public storefront view — published products only. */
export async function listProductsForBrand(brandId: string): Promise<Product[]> {
  const rows = await prisma.product.findMany({ where: { brandId, status: "active" } });
  return rows.map(toDomainProduct);
}

/** Admin/catalogue view — every status, so a merchandiser can see what an import just staged. */
export async function listAllProductsForBrand(brandId: string): Promise<Product[]> {
  const rows = await prisma.product.findMany({ where: { brandId } });
  return rows.map(toDomainProduct);
}

export async function getProductBySku(brandId: string, sku: string): Promise<Product | undefined> {
  const row = await prisma.product.findUnique({ where: { brandId_sku: { brandId, sku } } });
  return row ? toDomainProduct(row) : undefined;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const row = await prisma.product.findUnique({ where: { id } });
  return row ? toDomainProduct(row) : undefined;
}

/** Insert or replace by id — the import commit step is the only writer besides seed(). */
export async function upsertProduct(product: Product): Promise<void> {
  const data = {
    tenantId: product.tenantId,
    brandId: product.brandId,
    sku: product.sku,
    status: product.status,
    name: toJson(product.name),
    description: toJson(product.description),
    category: toJson(product.category),
    color: toJson(product.color),
    size: toJson(product.size),
    material: toJson(product.material),
    dimensions: toJson(product.dimensions),
    images: toJson(product.images),
    priceAmountMinor: product.price.amountMinor,
    priceCurrency: product.price.currency,
    salePriceAmountMinor: product.salePrice.amountMinor,
    salePriceCurrency: product.salePrice.currency,
    stock: product.stock,
  };
  await prisma.product.upsert({
    where: { id: product.id },
    update: data,
    create: { id: product.id, ...data },
  });
}

/** Permanent delete — the catalogue's own "remove this product" action, and how a batch rollback undoes rows it added. Returns false if the id didn't exist (already gone, or never did). */
export async function deleteProduct(id: string): Promise<boolean> {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
