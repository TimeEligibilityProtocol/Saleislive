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
    color: string,
    material: string,
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
    color: approvedField(color),
    size: approvedField("One size"),
    material: approvedField(material),
    images: [{ url: imageUrl, alt: name, isMain: true }],
    price: { amountMinor: priceMinor, currency: "AED" },
    salePrice: { amountMinor: saleMinor, currency: "AED" },
    stock,
    createdAt: now,
    updatedAt: now,
  });

  products = [
    base("p1", "DEMO-001", "Pleated Wrap Dress", "Fashion", "Ivory", "Viscose blend", 46000, 32200, 6, "/assets/products/product-01.jpg"),
    base("p2", "DEMO-002", "Tailored Wool Blazer", "Fashion", "Camel", "Wool blend", 89000, 62300, 4, "/assets/products/product-02.jpg"),
    base("p3", "DEMO-003", "Slingback Heels", "Shoes", "Ivory / Black", "Leather", 78000, 54600, 5, "/assets/products/product-03.jpg"),
    base("p4", "DEMO-004", "Leather Penny Loafers", "Shoes", "Brown", "Leather", 65000, 45500, 7, "/assets/products/product-04.jpg"),
    base("p5", "DEMO-005", "Structured Leather Tote", "Bags", "Tan", "Leather", 185000, 129500, 3, "/assets/products/product-05.jpg"),
    base("p6", "DEMO-006", "Quilted Chain Bag", "Bags", "Ivory", "Leather", 165000, 115500, 2, "/assets/products/product-06.jpg"),
    base("p7", "DEMO-007", "Suede Hobo Bag", "Bags", "Burgundy", "Suede", 142000, 99400, 4, "/assets/products/product-07.jpg"),
    base("p8", "DEMO-008", "Silk-Blend Blouse", "Fashion", "Ivory", "Silk blend", 38000, 26600, 9, "/assets/products/product-08.jpg"),
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
