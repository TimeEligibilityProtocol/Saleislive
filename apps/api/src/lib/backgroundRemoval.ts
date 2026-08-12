import { removeBackground } from "@imgly/background-removal-node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readLocalAsset } from "./assetStorage.js";

/**
 * Ported from Cirka's apps/api/src/routes/backgroundRemoval.ts — same
 * model, same fixes, don't re-derive them:
 *  - The package's own default `publicPath` resolves "node_modules/@imgly/..."
 *    against process.cwd(), which breaks under npm workspace hoisting (the
 *    package lives in the repo root's node_modules, not apps/api's).
 *    `import.meta.resolve` finds its real install location regardless of cwd.
 *  - Phone photos are frequently landscape pixel data + an EXIF "rotate to
 *    portrait" tag; sharp doesn't apply that unless asked, so the model
 *    would otherwise see (and cut out) a sideways image.
 *  - A near-empty resulting mask means the model found nothing worth
 *    cutting out — that's a real failure, not a valid (if boring) result.
 */
const MODEL_ASSETS_PATH = `file://${path.dirname(fileURLToPath(import.meta.resolve("@imgly/background-removal-node")))}/`;
const MIN_PRODUCT_COVERAGE = 0.02;

async function nonTransparentFraction(pngBuffer: Buffer): Promise<number> {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { channels } = info;
  let opaque = 0;
  const totalPixels = data.length / channels;
  for (let i = channels - 1; i < data.length; i += channels) {
    if (data[i] > 16) opaque++;
  }
  return opaque / totalPixels;
}

/** Runs a real image-segmentation model locally (onnxruntime + a pretrained ISNet checkpoint bundled with the npm package) — no external AI API, no account, no key. Throws "no_product_detected" if the resulting cutout is effectively empty. */
export async function removeImageBackground(buffer: Buffer, mimetype: string): Promise<Buffer> {
  const normalizedBuffer = await sharp(buffer).rotate().toBuffer();
  // Must be a Blob with an explicit `type` — a raw Uint8Array gets wrapped in a type-less Blob internally, and the library's format sniffing keys off blob.type, not the actual byte content.
  const inputBlob = new Blob([normalizedBuffer], { type: mimetype || "image/jpeg" });
  const outBlob = await removeBackground(inputBlob, { publicPath: MODEL_ASSETS_PATH });
  const result = Buffer.from(await outBlob.arrayBuffer());

  const coverage = await nonTransparentFraction(result);
  if (coverage < MIN_PRODUCT_COVERAGE) throw new Error("no_product_detected");
  return result;
}

const BACKGROUND_PRESETS: Record<string, { r: number; g: number; b: number }> = {
  white: { r: 255, g: 255, b: 255 },
  cream: { r: 251, g: 250, b: 247 },
  charcoal: { r: 34, g: 34, b: 34 },
  navy: { r: 23, g: 59, b: 143 },
};

/**
 * Real photographed backdrops (Ola's own source images, from
 * SALEIS.LIVE/assets/backgrounds) — studio-style scenes with their own
 * lighting/shadow, not a flat-colour fill. Filenames double as the label
 * shown in the admin dropdown (see api-client's listBackgroundPresets doc).
 */
const BACKGROUND_IMAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "assets", "backgrounds");
const BACKGROUND_IMAGE_PRESETS: Record<string, string> = {
  "stone-texture": "01-stone-texture.png",
  studio: "02-studio.png",
  "architectural-niche": "03-architectural-niche.png",
  "light-halo": "04-light-halo.png",
  "palm-shadow": "05-palm-shadow.png",
  "glass-light": "06-glass-light.png",
};

export const BACKGROUND_PRESET_KEYS = [...Object.keys(BACKGROUND_PRESETS), ...Object.keys(BACKGROUND_IMAGE_PRESETS)];

function hex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/** Feeds the admin's visual preset picker (thumbnail grid, not a text dropdown) — the frontend has no other way to know which key is a flat colour vs. which PNG backs an image preset. */
export type BackgroundPresetMeta = { key: string; kind: "color"; color: string } | { key: string; kind: "image"; thumbnailUrl: string };

export const BACKGROUND_PRESET_META: BackgroundPresetMeta[] = [
  ...Object.entries(BACKGROUND_PRESETS).map(([key, { r, g, b }]) => ({ key, kind: "color" as const, color: `#${hex(r)}${hex(g)}${hex(b)}` })),
  ...Object.entries(BACKGROUND_IMAGE_PRESETS).map(([key, file]) => ({ key, kind: "image" as const, thumbnailUrl: `/assets/backgrounds/${file}` })),
];

export interface CompositeOptions {
  /** Fraction (0-1) of the canvas where the product's own center should land. 0.5/0.5 reproduces the old always-centered behaviour. */
  offsetX?: number;
  offsetY?: number;
  /** Fraction (0-1) of the canvas the product's longest side should occupy. */
  scale?: number;
  /** A merchant-uploaded background image, addressed the same way as a saved product photo (see readLocalAsset). Takes priority over presetKey when set. */
  customBackgroundUrl?: string;
}

/** Composites a cutout (transparent PNG) onto either a flat brand-colour backdrop, one of the real photographed scene backgrounds, or a merchant-uploaded custom background — at a caller-chosen position/scale (defaults reproduce the old fixed centering) so the product reads clearly without ever touching the product's own pixels. */
export async function compositeOntoBackground(cutoutPng: Buffer, presetKey: string, options: CompositeOptions = {}): Promise<Buffer> {
  const { offsetX = 0.5, offsetY = 0.5, scale = 0.72, customBackgroundUrl } = options;
  const cutout = sharp(cutoutPng);
  const meta = await cutout.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1200;
  // Canvas a bit larger than the cutout so the product doesn't touch the edges.
  const canvasSize = Math.round(Math.max(width, height) * 1.35);
  const resized = await cutout
    .resize({ width: Math.round(canvasSize * scale), height: Math.round(canvasSize * scale), fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();
  const resizedWidth = resizedMeta.width ?? 0;
  const resizedHeight = resizedMeta.height ?? 0;
  const left = Math.round(canvasSize * offsetX - resizedWidth / 2);
  const top = Math.round(canvasSize * offsetY - resizedHeight / 2);

  const customAsset = customBackgroundUrl ? await readLocalAsset(customBackgroundUrl) : null;
  const imageFile = BACKGROUND_IMAGE_PRESETS[presetKey];
  const base = customAsset
    ? sharp(customAsset.buffer).resize({ width: canvasSize, height: canvasSize, fit: "cover" })
    : imageFile
      ? sharp(path.join(BACKGROUND_IMAGE_DIR, imageFile)).resize({ width: canvasSize, height: canvasSize, fit: "cover" })
      : sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: { ...(BACKGROUND_PRESETS[presetKey] ?? BACKGROUND_PRESETS.white), alpha: 1 } } });

  // sharp's composite() throws ("Image to composite must have same dimensions
  // or smaller") the moment the overlay pokes past the base canvas on any
  // side — which a scale above ~0.74, or just a large-enough scale dragged
  // near an edge, does immediately (real incident, 2026-08-12: "Couldn't
  // apply that background"). Zooming a product in past the frame is a
  // real, intended feature (see BackgroundPositioner's comment), so the
  // fix is to crop the overlay down to whatever's actually visible inside
  // the canvas — not to cap the scale.
  const srcLeft = Math.max(0, -left);
  const srcTop = Math.max(0, -top);
  const destLeft = Math.max(0, left);
  const destTop = Math.max(0, top);
  const visibleWidth = Math.min(resizedWidth - srcLeft, canvasSize - destLeft);
  const visibleHeight = Math.min(resizedHeight - srcTop, canvasSize - destTop);

  const composited =
    visibleWidth > 0 && visibleHeight > 0
      ? base.composite([{ input: await sharp(resized).extract({ left: srcLeft, top: srcTop, width: visibleWidth, height: visibleHeight }).toBuffer(), left: destLeft, top: destTop }])
      : base; // Dragged/zoomed the product fully out of frame — an empty background is the honest result, not a crash.

  return composited.png().toBuffer();
}
