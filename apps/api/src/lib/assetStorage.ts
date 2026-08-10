import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "assets", "uploads");

/** Writes a file to public/assets/uploads and returns its served path (e.g. "/assets/uploads/xyz.jpg") — same static mount apps/api/src/index.ts serves /assets/products from. Shared by the embedded-Excel-photo extractor and Product Studio's direct photo upload, so every saved image lands in one place with one naming scheme. */
export async function saveUploadedAsset(data: Buffer, extension: string, prefix: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${prefix}-${randomUUID()}.${extension}`;
  await writeFile(path.join(UPLOADS_DIR, filename), data);
  return `/assets/uploads/${filename}`;
}

const EXTENSION_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Reads back a previously-saved local asset (any /assets/... url) for server-side processing (AI analysis, background removal). Returns null for a remote http(s) URL — this app doesn't fetch third-party URLs server-side — or an unrecognized extension. */
export async function readLocalAsset(url: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
  if (url.startsWith("http")) return null;
  const extension = url.split(".").pop()?.toLowerCase() ?? "";
  const mimetype = EXTENSION_MIME[extension];
  if (!mimetype) return null;
  try {
    const buffer = await readFile(path.join(PUBLIC_DIR, url.replace(/^\//, "")));
    return { buffer, mimetype };
  } catch {
    return null;
  }
}
