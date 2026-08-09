import { approvedField, Product } from "@saleis-live/domain";

/**
 * In-memory only, same pragmatic starting point as tenants.ts. P001-P006
 * seeded from SALEIS.LIVE/fictional_product_catalog_EN.xlsx — the spec's
 * own demo catalog, not invented placeholder data. No markup/"was" price
 * is fabricated: the sheet gives one net price, so price === salePrice
 * here (no fake discount on real data). P007 has no xlsx row — Ola asked
 * for a Beauty-category demo item using the spec's own product-07.jpg
 * photography, so its name/price/stock are a reasonable placeholder, same
 * honesty rule (price === salePrice, no fake discount).
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
    size: string,
    material: string,
    priceMinor: number,
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
    size: approvedField(size),
    material: approvedField(material),
    images: [{ url: imageUrl, alt: name, isMain: true }],
    price: { amountMinor: priceMinor, currency: "AED" },
    salePrice: { amountMinor: priceMinor, currency: "AED" },
    stock,
    createdAt: now,
    updatedAt: now,
  });

  products = [
    base("P001", "P001", "Pleated Midi Dress", "Clothing", "Cream", "S/M", "Polyester", 34900, 25, "/assets/products/product-01.jpg"),
    base("P002", "P002", "Gold Hoop Earrings", "Jewelry", "Gold", "One Size", "Stainless Steel", 12900, 40, "/assets/products/product-02.jpg"),
    base("P003", "P003", "Two-Tone Slingback Heels", "Shoes", "Cream / Brown", "37–41", "Vegan Leather", 29900, 18, "/assets/products/product-03.jpg"),
    base("P004", "P004", "Leather Loafers", "Shoes", "Dark Brown", "40–44", "Genuine Leather", 39900, 15, "/assets/products/product-04.jpg"),
    base("P005", "P005", "Crescent Shoulder Bag", "Accessories", "Dark Brown", "One Size", "Vegan Leather", 27900, 12, "/assets/products/product-05.jpg"),
    base("P006", "P006", "Sculptural Ceramic Vase", "Home", "Ivory", "One Size", "Ceramic", 15900, 30, "/assets/products/product-08.jpg"),
    base("P007", "P007", "Repair Serum", "Beauty", "Amber", "30ml", "Glass", 18900, 20, "/assets/products/product-07.jpg"),
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

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/** Insert or replace by id — the import commit step is the only writer besides seed(). */
export function upsertProduct(product: Product): void {
  const i = products.findIndex((p) => p.id === product.id);
  if (i === -1) products.push(product);
  else products[i] = product;
}
