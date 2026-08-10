import * as XLSX from "xlsx";
import type { ParsedImportRow } from "@saleis-live/domain";

/** Canonical field -> header names merchants commonly use, matched case/punctuation-insensitively. */
const COLUMN_ALIASES: Record<keyof ParsedImportRow, string[]> = {
  sku: ["sku", "productsku", "ean", "gtin", "barcode", "id", "productid"],
  name: ["name", "title", "productname", "producttitle"],
  description: ["description", "desc"],
  category: ["category", "type", "productcategory"],
  color: ["color", "colour"],
  size: ["size"],
  material: ["material", "fabric"],
  dimensions: ["dimensions", "dimension", "size(cm)", "measurements"],
  price: ["price", "originalprice", "listprice", "rrp"],
  salePrice: ["saleprice", "discountedprice", "promoprice"],
  currency: ["currency"],
  stock: ["stock", "quantity", "qty", "inventory"],
  imageUrl: ["image", "imageurl", "photo", "picture", "imagelink"],
};

const REQUIRED_FIELDS: (keyof ParsedImportRow)[] = ["sku"];

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ColumnMapping {
  /** canonical field -> the actual header text found in the file */
  fields: Partial<Record<keyof ParsedImportRow, string>>;
  missingRequired: (keyof ParsedImportRow)[];
  unmappedHeaders: string[];
}

/**
 * Screen 03 ("Confirm import mapping") lets a merchant repoint a header
 * that the alias table missed — overrides win over auto-detection, keyed
 * by the literal header text as it appears in the file.
 */
export function detectColumnMapping(headers: string[], overrides: Partial<Record<string, keyof ParsedImportRow>> = {}): ColumnMapping {
  const fields: Partial<Record<keyof ParsedImportRow, string>> = {};
  const usedHeaders = new Set<string>();

  for (const header of headers) {
    const field = overrides[header];
    if (!field || fields[field]) continue;
    fields[field] = header;
    usedHeaders.add(header);
  }

  for (const header of headers) {
    if (usedHeaders.has(header)) continue;
    const normalized = normalize(header);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ParsedImportRow, string[]][]) {
      if (fields[field]) continue;
      if (aliases.includes(normalized)) {
        fields[field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !fields[f]);
  const unmappedHeaders = headers.filter((h) => !usedHeaders.has(h));
  return { fields, missingRequired, unmappedHeaders };
}

export interface ParsedSpreadsheet {
  headers: string[];
  rawRows: Record<string, string>[];
  mapping: ColumnMapping;
  rows: ParsedImportRow[];
}

/** Reads .xlsx, .xls or .csv (SheetJS handles all three from a single buffer). */
export function parseSpreadsheet(buffer: Buffer, filename: string, overrides: Partial<Record<string, keyof ParsedImportRow>> = {}): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const headers: string[] = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const mapping = detectColumnMapping(headers, overrides);

  const rows: ParsedImportRow[] = rawRows.map((raw) => {
    const get = (field: keyof ParsedImportRow): string | undefined => {
      const header = mapping.fields[field];
      if (!header) return undefined;
      const value = String(raw[header] ?? "").trim();
      return value === "" ? undefined : value;
    };
    return {
      sku: get("sku") ?? "",
      name: get("name"),
      description: get("description"),
      category: get("category"),
      color: get("color"),
      size: get("size"),
      material: get("material"),
      dimensions: get("dimensions"),
      price: get("price"),
      salePrice: get("salePrice"),
      currency: get("currency"),
      stock: get("stock"),
      imageUrl: get("imageUrl"),
    };
  });

  return { headers, rawRows, mapping, rows };
}
