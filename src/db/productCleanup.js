import { dbExecute, dbSelect } from "./sqlParams";
import { nowIso } from "../utils/ids";
import { SYNC_STATUS } from "./schema";
import { productBatchKey } from "../utils/productBatches";

/** Legacy demo catalog — removed from DB on first cleanup after upgrade. */
export const DEMO_PRODUCT_NAMES = [
  "Paracetamol 500mg",
  "Amoxicillin 250mg",
  "Bottled Water 500ml",
  "Quinine 300mg",
];

/** Keep first row per batch; delete later duplicates (e.g. double seed + migration). */
export async function removeDuplicateProducts(db) {
  const rows = await dbSelect(
    db,
    "SELECT id, name, lot_number, expiration_date, updated_at FROM products ORDER BY updated_at ASC, name ASC"
  );
  const seen = new Set();
  let removed = 0;

  for (const row of rows) {
    const key = productBatchKey({
      name: row.name,
      lotNumber: row.lot_number,
      expirationDate: row.expiration_date,
    });
    if (seen.has(key)) {
      await dbExecute(db, "DELETE FROM products WHERE id = ?", [row.id]);
      removed += 1;
    } else {
      seen.add(key);
    }
  }

  return removed;
}

export async function removeDemoProducts(db) {
  for (const name of DEMO_PRODUCT_NAMES) {
    await dbExecute(db, "DELETE FROM products WHERE name = ?", [name]);
  }
  return DEMO_PRODUCT_NAMES.length;
}

/** One-time demo removal + dedupe on every startup (dedupe is cheap). */
export async function cleanupProductsTable(db) {
  const meta = await dbSelect(db, "SELECT value FROM app_meta WHERE key = 'demo_products_removed'");
  const ts = nowIso();
  let demoRemoved = 0;

  if (meta[0]?.value !== "1") {
    demoRemoved = await removeDemoProducts(db);
    await dbExecute(
      db,
      `INSERT OR REPLACE INTO app_meta (key, value, updated_at, sync_status) VALUES (?, ?, ?, ?)`,
      ["demo_products_removed", "1", ts, SYNC_STATUS.SYNCED]
    );
  }

  const dupesRemoved = await removeDuplicateProducts(db);
  return { demoRemoved, dupesRemoved };
}
