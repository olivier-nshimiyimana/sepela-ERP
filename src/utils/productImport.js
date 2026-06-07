import { appError, DEFAULT_LOCALE } from "../i18n";

export const PRODUCT_IMPORT_COLUMNS = [
  "id",
  "name",
  "lot_number",
  "expiration_date",
  "price",
  "stock",
  "buy_unit",
  "buy_unit_cost",
  "qty_per_unit",
  "item_size_label",
  "reorder_level_items",
  "updated_at",
  "sync_status",
];

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((value) => value.trim());
}

function escapeCsvValue(value) {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function parseProductImportCsv(text, locale = DEFAULT_LOCALE) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return {
      ok: false,
      error: appError("csvHeaderAndRow", locale, { header: PRODUCT_IMPORT_COLUMNS.join(", ") }),
    };
  }

  const header = parseCsvLine(lines[0]);
  const exactHeader = PRODUCT_IMPORT_COLUMNS.join(",");
  if (header.join(",") !== exactHeader) {
    return {
      ok: false,
      error: appError("csvHeader", locale, { header: exactHeader }),
    };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    if (values.length !== PRODUCT_IMPORT_COLUMNS.length) {
      return {
        ok: false,
        error: `Row ${i + 1} must contain ${PRODUCT_IMPORT_COLUMNS.length} columns.`,
      };
    }
    rows.push(
      Object.fromEntries(PRODUCT_IMPORT_COLUMNS.map((column, idx) => [column, values[idx]]))
    );
  }

  return { ok: true, rows };
}

export function buildProductImportCsv(products = []) {
  const lines = [PRODUCT_IMPORT_COLUMNS.join(",")];

  for (const product of products) {
    const row = [
      product.id ?? "",
      product.name ?? "",
      product.lotNumber ?? "",
      product.expirationDate ?? "",
      product.price ?? "",
      product.stockQuantityItems ?? product.stock ?? "",
      product.buyUnit ?? "Unit",
      product.buyUnitCost ?? 0,
      product.qtyPerUnit ?? 1,
      product.itemSizeLabel ?? "",
      product.reorderLevelItems ?? 0,
      product.updatedAt ?? "",
      product.syncStatus ?? "PENDING",
    ].map(escapeCsvValue);

    lines.push(row.join(","));
  }

  return lines.join("\r\n");
}
