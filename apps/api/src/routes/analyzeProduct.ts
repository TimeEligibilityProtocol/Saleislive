import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
      category: { type: "string", description: "A short product category, e.g. 'Dresses', 'Shoes', 'Bags'." },
      description: {
        type: "string",
        description: "A 1-2 sentence retail product description in a polished, on-brand tone suitable for a fashion/lifestyle storefront. Describe the item itself, not the photo.",
      },
    },
    required: ["color", "material", "category", "description"],
  },
};

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
      const message = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        tools: [RECORD_PRODUCT_DETAILS_TOOL],
        tool_choice: { type: "tool", name: "record_product_details" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: file.mimetype as "image/jpeg" | "image/png" | "image/webp", data: file.buffer.toString("base64") },
              },
              {
                type: "text",
                text: "This is a photo of a retail product for a fashion/lifestyle catalogue. Look at it carefully and record its details.",
              },
            ],
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        return res.status(502).json({ error: "no_analysis_returned" });
      }

      res.status(200).json(toolUse.input);
    } catch (err) {
      console.error("analyze-photo failed:", err);
      res.status(500).json({ error: "processing_failed" });
    }
  });

  return router;
}
