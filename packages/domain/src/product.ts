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

/** The "nothing here yet" shape — same as a field no source has ever touched. */
export function emptyField<T>(): AiAssistedField<T> {
  return { value: null, aiSuggestion: null, sourceType: null, sourceReference: null, confidenceScore: null, verificationState: "unverified", updatedBy: null, updatedAt: null, history: [] };
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

/**
 * Applies a manual edit from Product Studio (screen 05) — preserves the
 * field's prior value in history (same discipline as import's row-by-row
 * updates) rather than replacing it outright, and marks the field as
 * merchant-owned so it's never mistaken for an AI guess.
 */
export function editField<T>(current: AiAssistedField<T>, newValue: T, opts: { updatedBy: string; now: string }): AiAssistedField<T> {
  const changed = current.value !== newValue;
  const history = current.value != null && current.updatedAt ? [...current.history, { value: current.value, updatedBy: current.updatedBy ?? "unknown", updatedAt: current.updatedAt }] : current.history;
  return {
    value: newValue,
    aiSuggestion: current.aiSuggestion,
    sourceType: "merchant_manual",
    sourceReference: null,
    confidenceScore: 1,
    verificationState: changed ? "merchant_edited" : "merchant_confirmed",
    updatedBy: opts.updatedBy,
    updatedAt: opts.now,
    history,
  };
}

export type ProductStatus = "draft" | "active" | "archived";

/**
 * Where a photo is in the Background Studio pipeline. "cutout" is a
 * background-removed image that's never been placed on anything — a
 * floating product on a transparent/checkerboard canvas, not something a
 * customer should ever see. Only "original" (never touched) and "branded"
 * (composited onto a real background) count as finished; isCatalogueReady
 * blocks a product whose main photo is still a bare cutout.
 */
export type PhotoFinish = "original" | "cutout" | "branded";

/** A single product image — url is server-relative; alt/isMain drive gallery + listing-card selection. */
export interface ProductImage {
  url: string;
  alt: string;
  isMain: boolean;
  finish: PhotoFinish;
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
  /** Free text — "30 x 20 x 10 cm" or similar; format varies too much across categories (clothing/shoes/furniture/jewellery) for structured fields to be worth it yet. */
  dimensions: AiAssistedField<string>;
  images: ProductImage[];
  price: Money;
  salePrice: Money;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The single source of truth for "is this product complete enough to sell" —
 * shared by the server (which auto-derives `status` from it on every save,
 * so "active" always means "actually ready", not "someone once clicked
 * Approve") and the admin catalogue table (which uses it to sort/filter and
 * to show the same status the merchant would see on the product itself).
 * Deliberately broader than a bare "can this appear on the storefront at
 * all" check (photo/name/price>0) — also requires the catalogue-completeness
 * fields (category/colour/material) a merchant would expect a "ready"
 * product to have filled in.
 */
export function isCatalogueReady(product: Product): boolean {
  const mainImage = product.images.find((i) => i.isMain) ?? product.images[0];
  return (
    product.images.length > 0 &&
    mainImage?.finish !== "cutout" &&
    product.name.value != null &&
    product.price.amountMinor > 0 &&
    !!product.category.value &&
    !!product.color.value &&
    !!product.material.value
  );
}
