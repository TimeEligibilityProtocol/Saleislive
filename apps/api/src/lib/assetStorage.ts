import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

/**
 * Uploaded/generated images (imports, Product Studio photos, cutouts,
 * branded backgrounds) must NOT live inside the app's own container
 * filesystem — that's wiped clean on every deploy (see
 * docs/product/architecture-principles-v1.md §6, and the real photo loss
 * this caused on 2026-08-10). UPLOADS_DIR points at a Render Persistent
 * Disk's mount path instead, set via the UPLOADS_DIR env var (e.g.
 * "/var/data/uploads"). Falls back to the old in-container path only
 * when the env var is unset — i.e. local dev, where losing uploads on
 * every restart doesn't matter.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PUBLIC_DIR, "assets", "uploads");

/** Writes a file to UPLOADS_DIR and returns its served path (e.g. "/assets/uploads/xyz.jpg") — apps/api/src/index.ts mounts that URL prefix at UPLOADS_DIR specifically (not the general /assets static mount) so this works the same whether UPLOADS_DIR is the local fallback or a persistent disk. Shared by the embedded-Excel-photo extractor, Product Studio's photo upload, and background removal, so every saved image lands in one place with one naming scheme. */
export async function saveUploadedAsset(data: Buffer, extension: string, prefix: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${prefix}-${randomUUID()}.${extension}`;
  await writeFile(path.join(UPLOADS_DIR, filename), data);
  return `/assets/uploads/${filename}`;
}

const EXTENSION_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Reads back a previously-saved asset (any /assets/... url) for server-side processing (AI analysis, background removal). Checks UPLOADS_DIR first (where saveUploadedAsset writes), then the seed-image folder under public/. Returns null for a remote http(s) URL — this app doesn't fetch third-party URLs server-side — or an unrecognized extension. */
export async function readLocalAsset(url: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
  if (url.startsWith("http")) return null;
  const extension = url.split(".").pop()?.toLowerCase() ?? "";
  const mimetype = EXTENSION_MIME[extension];
  if (!mimetype) return null;
  const relative = url.replace(/^\/assets\//, "");
  const candidates = url.startsWith("/assets/uploads/") ? [path.join(UPLOADS_DIR, path.basename(url))] : [path.join(PUBLIC_DIR, "assets", relative)];
  for (const candidate of candidates) {
    try {
      return { buffer: await readFile(candidate), mimetype };
    } catch {
      continue;
    }
  }
  return null;
}
