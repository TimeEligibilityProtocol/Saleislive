import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { saveUploadedAsset } from "./assetStorage.js";

export async function saveEmbeddedImage(image: EmbeddedImage): Promise<string> {
  return saveUploadedAsset(image.data, image.extension, "import");
}

/**
 * Photos pasted directly into Excel cells (not a URL/text column) live in a
 * completely different part of the .xlsx file — it's a zip archive, and the
 * images sit in xl/media/ as raw binary, anchored to a row via drawing XML.
 * SheetJS (our normal parser) only reads cell text, so it never sees these.
 * This reads the zip directly to recover "row N has this image" pairs.
 */
export interface EmbeddedImage {
  /** 0-indexed data row (matching parseSpreadsheet's rawRows/rows arrays — header row already excluded). */
  dataRowIndex: number;
  data: Buffer;
  extension: string;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Real Excel writes these elements with an "xdr:"/"a:" namespace prefix; openpyxl (and some other writers) declare the same namespace as the element's *default* xmlns instead, so the parser sees no prefix at all. Try the prefixed key first, fall back to bare — same object either way once found. */
function pick(obj: Record<string, unknown> | undefined, prefixed: string, bare: string): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return (obj[prefixed] ?? obj[bare]) as Record<string, unknown> | undefined;
}

/**
 * Relationship targets in OOXML can be a package-absolute path ("/xl/media/image1.png"),
 * or relative to the .rels file's own folder ("../media/image1.png", "media/image1.png").
 * `base` is the folder the referencing part lives in (e.g. "xl/drawings" for drawing1.xml's rels).
 */
function resolveRelTarget(target: string, base: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseParts = base.split("/");
  for (const part of target.split("/")) {
    if (part === "..") baseParts.pop();
    else if (part !== ".") baseParts.push(part);
  }
  return baseParts.join("/");
}

/** Returns [] for .csv or any file with no embedded drawings — never throws, since this is a best-effort enhancement, not required for the import to work. */
export async function extractEmbeddedImages(buffer: Buffer): Promise<EmbeddedImage[]> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    const sheetRelsFile = zip.file("xl/worksheets/_rels/sheet1.xml.rels");
    if (!sheetRelsFile) return [];
    const sheetRelsXml = xmlParser.parse(await sheetRelsFile.async("string"));
    const drawingRel = asArray(sheetRelsXml.Relationships?.Relationship).find((r: Record<string, string>) => r["@_Type"]?.includes("/drawing"));
    if (!drawingRel) return [];
    const drawingPath = resolveRelTarget(String(drawingRel["@_Target"]), "xl/worksheets");

    const drawingFile = zip.file(drawingPath);
    if (!drawingFile) return [];
    const drawingXml = xmlParser.parse(await drawingFile.async("string"));

    const drawingDir = drawingPath.slice(0, drawingPath.lastIndexOf("/"));
    const drawingFilename = drawingPath.slice(drawingPath.lastIndexOf("/") + 1);
    const drawingRelsPath = `${drawingDir}/_rels/${drawingFilename}.rels`;
    const drawingRelsFile = zip.file(drawingRelsPath);
    if (!drawingRelsFile) return [];
    const drawingRelsXml = xmlParser.parse(await drawingRelsFile.async("string"));
    const relById = new Map<string, string>();
    for (const r of asArray(drawingRelsXml.Relationships?.Relationship)) {
      relById.set(r["@_Id"], resolveRelTarget(String(r["@_Target"]), drawingDir));
    }

    const wsDr = pick(drawingXml, "xdr:wsDr", "wsDr");
    const anchors = [...asArray(pick(wsDr, "xdr:twoCellAnchor", "twoCellAnchor") as unknown[] | undefined), ...asArray(pick(wsDr, "xdr:oneCellAnchor", "oneCellAnchor") as unknown[] | undefined)];

    const results: EmbeddedImage[] = [];
    for (const anchor of anchors as Record<string, unknown>[]) {
      const from = pick(anchor, "xdr:from", "from");
      const fromRow = from?.["xdr:row"] ?? from?.["row"];
      if (fromRow === undefined) continue;
      // Header occupies row 0 in the sheet's own numbering, so data row 0 = sheet row 1.
      const dataRowIndex = Number(fromRow) - 1;
      if (dataRowIndex < 0) continue;

      const pic = pick(anchor, "xdr:pic", "pic");
      const blipFill = pick(pic, "xdr:blipFill", "blipFill");
      const blip = (blipFill?.["a:blip"] ?? blipFill?.["blip"]) as Record<string, string> | undefined;
      const embedId = blip?.["@_r:embed"];
      if (!embedId) continue;
      const mediaPath = relById.get(embedId);
      if (!mediaPath) continue;
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;

      const data = await mediaFile.async("nodebuffer");
      const extension = mediaPath.split(".").pop()?.toLowerCase() ?? "png";
      results.push({ dataRowIndex, data, extension });
    }
    return results;
  } catch {
    return [];
  }
}
