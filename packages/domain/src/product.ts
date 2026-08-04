import { Money } from "./money.js";

/**
 * Every AI-touched field keeps the model's suggestion and the human's
 * approved value separate — the storefront only ever shows what a human
 * approved. Ported from wearto.you's AiAssistedField pattern (see
 * blueprint §5, "Zasady AI": confidence + source, nothing published
 * without approval where it matters).
 */
export interface AiAssistedField<T> {
  aiSuggestion: T | null;
  approvedValue: T | null;
  confidence: number | null;
  source: "file" | "image" | "ocr" | "generated" | null;
}

export function approvedField<T>(value: T): AiAssistedField<T> {
  return { aiSuggestion: value, approvedValue: value, confidence: 1, source: null };
}

export type ProductStatus = "draft" | "active" | "archived";

/** A single product image — url is server-relative; alt/isMain drive gallery + listing-card selection. */
export interface ProductImage {
  url: string;
  alt: string;
  isMain: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  brandId: string;
  /** Stable identity across re-imports — see blueprint §4 ("Identyfikuje produkt po SKU/variant SKU, a nie po nazwie"). */
  sku: string;
  status: ProductStatus;
  name: AiAssistedField<string>;
  description: AiAssistedField<string>;
  category: AiAssistedField<string>;
  color: AiAssistedField<string>;
  size: AiAssistedField<string>;
  material: AiAssistedField<string>;
  images: ProductImage[];
  price: Money;
  salePrice: Money;
  stock: number;
  createdAt: string;
  updatedAt: string;
}
