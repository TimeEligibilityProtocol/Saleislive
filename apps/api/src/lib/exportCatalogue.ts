import { Product } from "@saleis-live/domain";
import * as XLSX from "xlsx";

/**
 * Closes the loop with import: a merchant exports the current catalogue,
 * reconciles stock against their own warehouse offline, and re-uploads
 * the same file through Stock Intake — which diffs and updates by SKU
 * (see buildProductFromImportRow), never duplicates. Column headers here
 * intentionally match importParsing.ts's alias table so a round-tripped
 * file needs zero remapping on the way back in.
 */
export function productsToWorkbookBuffer(products: Product[]): Buffer {
  const rows = products.map((p) => ({
    SKU: p.sku,
    Name: p.name.value ?? "",
    Description: p.description.value ?? "",
    Category: p.category.value ?? "",
    Color: p.color.value ?? "",
    Size: p.size.value ?? "",
    Material: p.material.value ?? "",
    Price: (p.price.amountMinor / 100).toFixed(2),
    "Sale price": (p.salePrice.amountMinor / 100).toFixed(2),
    Currency: p.price.currency,
    Stock: p.stock,
    Image: p.images.find((i) => i.isMain)?.url ?? p.images[0]?.url ?? "",
    Status: p.status,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Catalogue");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
