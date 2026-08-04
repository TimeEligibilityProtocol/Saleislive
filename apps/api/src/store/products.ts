import { approvedField, Product } from "@saleis-live/domain";

/**
 * In-memory only, same pragmatic starting point as tenants.ts. Seeded so
 * the storefront has real data to render before the Excel import
 * pipeline exists — Ola's explicit note: self-test on files/data we
 * create ourselves rather than waiting on real client data.
 */
let products: Product[] = [];

function seed(): void {
  const now = new Date(0).toISOString();
  const base = (
    id: string,
    sku: string,
    name: string,
    category: string,
    priceMinor: number,
    saleMinor: number,
    stock: number,
    imageUrl: string
  ): Product => ({
    id,
    tenantId: "t_demo",
    brandId: "b_demo",
    sku,
    status: "active",
    name: approvedField(name),
    description: approvedField(`${name} — part of this season's selection.`),
    category: approvedField(category),
    color: approvedField("Ivory"),
    size: approvedField("One size"),
    material: approvedField("Mixed"),
    images: [{ url: imageUrl, alt: name, isMain: true }],
    price: { amountMinor: priceMinor, currency: "AED" },
    salePrice: { amountMinor: saleMinor, currency: "AED" },
    stock,
    createdAt: now,
    updatedAt: now,
  });

  products = [
    base("p1", "DEMO-001", "Sculptural Hoop Earrings", "Jewellery", 18000, 12600, 6, "/assets/demo/earrings.svg"),
    base("p2", "DEMO-002", "Leather Shoulder Bag", "Fashion", 45000, 31500, 3, "/assets/demo/bag.svg"),
    base("p3", "DEMO-003", "Hand Wash — Cedar", "Beauty", 4200, 2940, 12, "/assets/demo/handwash.svg"),
    base("p4", "DEMO-004", "Ceramic Form Vase", "Home", 8800, 6160, 5, "/assets/demo/vase.svg"),
  ];
}
seed();

/** Public storefront view — published products only. */
export function listProductsForBrand(brandId: string): Product[] {
  return products.filter((p) => p.brandId === brandId && p.status === "active");
}

/** Admin/catalogue view — every status, so a merchandiser can see what an import just staged. */
export function listAllProductsForBrand(brandId: string): Product[] {
  return products.filter((p) => p.brandId === brandId);
}

export function getProductBySku(brandId: string, sku: string): Product | undefined {
  return products.find((p) => p.brandId === brandId && p.sku === sku);
}

/** Insert or replace by id — the import commit step is the only writer besides seed(). */
export function upsertProduct(product: Product): void {
  const i = products.findIndex((p) => p.id === product.id);
  if (i === -1) products.push(product);
  else products[i] = product;
}
