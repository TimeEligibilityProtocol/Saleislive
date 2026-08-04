import { Money } from "./money.js";

/**
 * Where a field's current value came from. "spreadsheet" and
 * "merchant_manual" are trusted merchant-provided facts, never AI
 * guesses — see saleis-live-complete-v2 spec: AI may generate
 * non-critical copy/attributes freely, but must never silently invent
 * critical facts (price, stock, SKU, material/authenticity, etc.).
 */
export type FieldSourceType = "spreadsheet" | "image_ai" | "ocr" | "merchant_manual" | "ai_generated" | "system_default";

export type FieldVerificationState =
  | "unverified"
  | "ai_suggested"
  | "merchant_confirmed"
  | "merchant_edited"
  | "flagged";

export interface FieldHistoryEntry<T> {
  value: T | null;
  updatedBy: string;
  updatedAt: string;
}

/**
 * Every AI-touched or imported field keeps full provenance — the
 * catalogue review UI and publish-readiness checks read this, not just
 * the raw value. Ported from wearto.you's simpler AiAssistedField
 * pattern, expanded to match saleis-live-complete-v2 §"AI merchandising
 * assistant": source, confidence, verification state, who/when, and an
 * undo/audit history of prior values.
 */
export interface AiAssistedField<T> {
  value: T | null;
  aiSuggestion: T | null;
  sourceType: FieldSourceType | null;
  sourceReference: string | null;
  confidenceScore: number | null;
  verificationState: FieldVerificationState;
  updatedBy: string | null;
  updatedAt: string | null;
  history: FieldHistoryEntry<T>[];
}

/** A field entered or confirmed directly by a human — trusted, no review needed. */
export function approvedField<T>(value: T, updatedBy = "system", updatedAt = new Date(0).toISOString()): AiAssistedField<T> {
  return {
    value,
    aiSuggestion: null,
    sourceType: "merchant_manual",
    sourceReference: null,
    confidenceScore: 1,
    verificationState: "merchant_confirmed",
    updatedBy,
    updatedAt,
    history: [],
  };
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
