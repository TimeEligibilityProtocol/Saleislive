import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/** Ola's fixed department taxonomy (2026-08-12) — every AI category suggestion must land in exactly one of these, not a free-text subcategory, so the catalogue stays organized the same way regardless of who described the product. Mirrored in admin/src/App.tsx's CATEGORY_OPTIONS for the manual dropdown. */
export const PRODUCT_CATEGORY_OPTIONS = ["Men", "Women", "Kids", "Home", "Jewellery", "Beauty"] as const;

const RECORD_PRODUCT_DETAILS_TOOL = {
  name: "record_product_details",
  description: "Record what you can see about the product in the photo, for a retail catalogue listing.",
  input_schema: {
    type: "object" as const,
    properties: {
      color: { type: "string", description: "The product's primary colour, e.g. 'Ivory', 'Camel', 'Black'." },
      material: {
        type: "string",
        description: "Best guess at the fabric/material, e.g. 'Leather', 'Cotton blend'. Say 'Unknown' if genuinely not visible — never guess confidently on a fact the merchant needs to verify.",
      },
      category: {
        type: "string",
        enum: PRODUCT_CATEGORY_OPTIONS as unknown as string[],
        description:
          "Which department this product belongs in. Pick the one who it's for/where it's used, not the item type — e.g. a men's leather belt is 'Men' (not 'Accessories'), a scented candle is 'Home', a necklace is 'Jewellery', a face cream is 'Beauty'. If a product could plausibly fit more than one (e.g. unisex), pick the department the styling most clearly reads as.",
      },
      description: {
        type: "string",
        description: "A 1-2 sentence retail product description in a polished, on-brand tone suitable for a fashion/lifestyle storefront. Describe the item itself, not the photo.",
      },
    },
    required: ["color", "material", "category", "description"],
  },
};

export interface PhotoAnalysis {
  color: string;
  material: string;
  category: string;
  description: string;
}

/**
 * The actual vision call, shared by the HTTP route (Product Studio's
 * manual "Suggest with AI") and any automatic caller (import commit,
 * Product Studio's "Add a photo" — see their doc comments for how each
 * decides whether to write the result as a confirmed value or leave it
 * for review). Throws on any failure; callers decide whether that should
 * be fatal or swallowed.
 */
export async function analyzeProductImage(client: Anthropic, buffer: Buffer, mimetype: string): Promise<PhotoAnalysis> {
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools: [RECORD_PRODUCT_DETAILS_TOOL],
    tool_choice: { type: "tool", name: "record_product_details" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimetype as "image/jpeg" | "image/png" | "image/webp", data: buffer.toString("base64") } },
          { type: "text", text: "This is a photo of a retail product for a fashion/lifestyle catalogue. Look at it carefully and record its details." },
        ],
      },
    ],
  });
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("no_analysis_returned");
  return toolUse.input as PhotoAnalysis;
}

/**
 * Real AI photo analysis for Product Studio's "Suggest with AI" — ported
 * from Cirka's analyzePhoto.ts, retuned for a retail/luxury catalogue
 * (no resale condition/measurements checklist). Separate from background
 * removal: that's a local segmentation model with no external API; this
 * needs an actual vision-capable LLM call, so it requires
 * ANTHROPIC_API_KEY (see .env.example). Color/material are "critical
 * facts" per packages/domain/src/product.ts's doc comment — this route
 * only *suggests* them; the caller must never write them to a product
 * without the merchant reviewing and explicitly saving.
 */
export function analyzeProductRouter(anthropicApiKey: string | null): Router {
  const router = Router();
  const client = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

  router.post("/api/products/analyze-photo", upload.single("photo"), async (req, res) => {
    if (!client) {
      return res.status(503).json({ error: "ai_not_configured" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: "no_file" });
    if (!file.mimetype.startsWith("image/")) return res.status(400).json({ error: "not_an_image" });

    try {
      const analysis = await analyzeProductImage(client, file.buffer, file.mimetype);
      res.status(200).json(analysis);
    } catch (err) {
      console.error("analyze-photo failed:", err);
      res.status(500).json({ error: "processing_failed", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Same client construction the router above uses — exported so automatic (non-HTTP) callers can reuse it without re-reading env vars themselves. */
export function createAnthropicClient(anthropicApiKey: string | null): Anthropic | null {
  return anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;
}
