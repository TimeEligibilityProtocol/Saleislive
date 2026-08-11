import { removeBackground } from "@imgly/background-removal-node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

/** Composites a cutout (transparent PNG) onto either a flat brand-colour backdrop or one of the real photographed scene backgrounds, centered with generous margin so the product reads clearly. */
export async function compositeOntoBackground(cutoutPng: Buffer, presetKey: string): Promise<Buffer> {
  const cutout = sharp(cutoutPng);
  const meta = await cutout.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1200;
  // Canvas a bit larger than the cutout so the product doesn't touch the edges.
  const canvasSize = Math.round(Math.max(width, height) * 1.35);
  const resized = await cutout
    .resize({ width: Math.round(canvasSize * 0.72), height: Math.round(canvasSize * 0.72), fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();
  const left = Math.round((canvasSize - (resizedMeta.width ?? 0)) / 2);
  const top = Math.round((canvasSize - (resizedMeta.height ?? 0)) / 2);

  const imageFile = BACKGROUND_IMAGE_PRESETS[presetKey];
  const base = imageFile
    ? sharp(path.join(BACKGROUND_IMAGE_DIR, imageFile)).resize({ width: canvasSize, height: canvasSize, fit: "cover" })
    : sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: { ...(BACKGROUND_PRESETS[presetKey] ?? BACKGROUND_PRESETS.white), alpha: 1 } } });

  return base
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}
