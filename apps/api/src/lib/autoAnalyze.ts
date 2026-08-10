import { AiAssistedField, editField, Product } from "@saleis-live/domain";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeProductImage } from "../routes/analyzeProduct.js";
import { readLocalAsset } from "./assetStorage.js";

function suggestedField<T>(current: AiAssistedField<T>, value: T, now: string): AiAssistedField<T> {
  // Same shape as editField's output, but verificationState stays "ai_suggested" (never "merchant_confirmed") — this value is genuinely live on the product so the demo/storefront can show it, but its provenance honestly says "AI guessed this, nobody has reviewed it yet".
  const edited = editField(current, value, { updatedBy: "ai_auto_analysis", now });
  return { ...edited, verificationState: "ai_suggested", aiSuggestion: value, sourceType: "image_ai" };
}

/**
 * Runs real vision analysis on a product's main photo and fills in
 * color/material/category/description automatically — this is what makes
 * "upload a photo, description appears on the page" actually true instead
 * of requiring a manual "Suggest with AI" click every time. Only touches
 * a product that has no description yet, so it never overwrites a
 * merchant's own words or a previous manual edit. Never throws: AI being
 * unavailable or slow should never break an import or a photo upload —
 * worst case, the product just keeps its blank fields for a human to fill
 * in later, exactly like before this existed.
 */
export async function autoAnalyzeIfNeeded(client: Anthropic | null, product: Product, now: string): Promise<Product> {
  if (!client) return product;
  if (product.description.value) return product; // already has real copy — never overwrite
  const mainImage = product.images.find((i) => i.isMain) ?? product.images[0];
  if (!mainImage) return product;

  const image = await readLocalAsset(mainImage.url);
  if (!image) return product;

  try {
    const analysis = await analyzeProductImage(client, image.buffer, image.mimetype);
    return {
      ...product,
      color: product.color.value ? product.color : suggestedField(product.color, analysis.color, now),
      material: product.material.value ? product.material : suggestedField(product.material, analysis.material, now),
      category: product.category.value ? product.category : suggestedField(product.category, analysis.category, now),
      description: suggestedField(product.description, analysis.description, now),
    };
  } catch (err) {
    console.error("auto photo analysis failed:", err);
    return product;
  }
}
