import { SYNC_STATUS } from "./schema";
import { dbExecute, dbSelect } from "./sqlParams";
import { calcItemUnitCost, normalizeInventoryBreakdown } from "../utils/inventoryBreakdown";

/** Plain column — Tauri/SQLite builds reject GENERATED ALWAYS in some tools and runtimes. */
export const INVENTORY_BREAKDOWN_DDL = `CREATE TABLE IF NOT EXISTS inventory_breakdown (
  product_id TEXT PRIMARY KEY,
  buy_unit TEXT NOT NULL DEFAULT 'Unit',
  buy_unit_cost REAL NOT NULL DEFAULT 0 CHECK (buy_unit_cost >= 0),
  qty_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (qty_per_unit > 0),
  item_size_label TEXT,
  stock_quantity_items INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity_items >= 0),
  reorder_level_items INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level_items >= 0),
  item_unit_cost REAL NOT NULL DEFAULT 0 CHECK (item_unit_cost >= 0),
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
)`;

export const INVENTORY_BREAKDOWN_INDEX = `CREATE INDEX IF NOT EXISTS idx_inventory_breakdown_sync ON inventory_breakdown(sync_status)`;

const MIGRATION_KEY = "inventory_breakdown_v7";
const REPAIR_GENERATED_KEY = "inventory_breakdown_v8";

async function repairGeneratedItemUnitCostColumn(db) {
  const repaired = await dbSelect(db, "SELECT value FROM app_meta WHERE key = ?", [REPAIR_GENERATED_KEY]);
  if (repaired[0]?.value === "1") return;

  const ddlRows = await dbSelect(
    db,
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_breakdown'"
  );
  const ddl = String(ddlRows[0]?.sql ?? "");
  if (!ddl.includes("GENERATED")) {
    const ts = new Date().toISOString();
    await dbExecute(
      db,
      `INSERT INTO app_meta (key, value, updated_at, sync_status)
       VALUES (?, '1', ?, 'SYNCED')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [REPAIR_GENERATED_KEY, ts]
    );
    return;
  }

  const rows = await dbSelect(
    db,
    `SELECT product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
            stock_quantity_items, reorder_level_items, updated_at, sync_status
     FROM inventory_breakdown`
  );

  await db.execute("DROP TABLE inventory_breakdown");
  await db.execute(INVENTORY_BREAKDOWN_DDL);
  await db.execute(INVENTORY_BREAKDOWN_INDEX);

  for (const row of rows) {
    const itemUnitCost = calcItemUnitCost(row.buy_unit_cost, row.qty_per_unit);
    await dbExecute(
      db,
      `INSERT INTO inventory_breakdown (
         product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
         stock_quantity_items, reorder_level_items, item_unit_cost, updated_at, sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.product_id,
        row.buy_unit,
        row.buy_unit_cost,
        row.qty_per_unit,
        row.item_size_label,
        row.stock_quantity_items,
        row.reorder_level_items,
        itemUnitCost,
        row.updated_at,
        row.sync_status,
      ]
    );
  }

  const ts = new Date().toISOString();
  await dbExecute(
    db,
    `INSERT INTO app_meta (key, value, updated_at, sync_status)
     VALUES (?, '1', ?, 'SYNCED')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [REPAIR_GENERATED_KEY, ts]
  );
}

export async function migrateInventoryBreakdown(db) {
  await repairGeneratedItemUnitCostColumn(db);
  await db.execute(INVENTORY_BREAKDOWN_DDL);
  await db.execute(INVENTORY_BREAKDOWN_INDEX);

  const done = await dbSelect(db, "SELECT value FROM app_meta WHERE key = ?", [MIGRATION_KEY]);
  if (done[0]?.value === "1") return;

  const products = await dbSelect(
    db,
    `SELECT id, stock, updated_at, sync_status FROM products`
  );

  for (const row of products) {
    const existing = await dbSelect(
      db,
      `SELECT product_id FROM inventory_breakdown WHERE product_id = ?`,
      [row.id]
    );
    if (existing.length) continue;

    const stock = Math.max(0, parseInt(row.stock, 10) || 0);
    await dbExecute(
      db,
      `INSERT INTO inventory_breakdown (
         product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
         stock_quantity_items, reorder_level_items, item_unit_cost, updated_at, sync_status
       ) VALUES (?, 'Unit', 0, 1, '', ?, 0, 0, ?, ?)`,
      [row.id, stock, row.updated_at, row.sync_status ?? SYNC_STATUS.PENDING]
    );
  }

  const ts = new Date().toISOString();
  await dbExecute(
    db,
    `INSERT INTO app_meta (key, value, updated_at, sync_status)
     VALUES (?, '1', ?, 'SYNCED')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [MIGRATION_KEY, ts]
  );
}

export function mapBreakdownRow(row, stockFallback = 0) {
  if (!row?.product_id && !row?.buy_unit) {
    return normalizeInventoryBreakdown({}, stockFallback);
  }
  return normalizeInventoryBreakdown(
    {
      buyUnit: row.buy_unit,
      buyUnitCost: row.buy_unit_cost,
      qtyPerUnit: row.qty_per_unit,
      itemSizeLabel: row.item_size_label,
      stockQuantityItems: row.stock_quantity_items,
      reorderLevelItems: row.reorder_level_items,
      itemUnitCost: row.item_unit_cost,
    },
    stockFallback
  );
}

export async function upsertInventoryBreakdown(db, productId, breakdown, ts, syncStatus = SYNC_STATUS.PENDING) {
  const normalized = normalizeInventoryBreakdown(breakdown);
  const itemUnitCost = calcItemUnitCost(normalized.buyUnitCost, normalized.qtyPerUnit);
  await dbExecute(
    db,
    `INSERT INTO inventory_breakdown (
       product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
       stock_quantity_items, reorder_level_items, item_unit_cost, updated_at, sync_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       buy_unit = excluded.buy_unit,
       buy_unit_cost = excluded.buy_unit_cost,
       qty_per_unit = excluded.qty_per_unit,
       item_size_label = excluded.item_size_label,
       stock_quantity_items = excluded.stock_quantity_items,
       reorder_level_items = excluded.reorder_level_items,
       item_unit_cost = excluded.item_unit_cost,
       updated_at = excluded.updated_at,
       sync_status = excluded.sync_status`,
    [
      productId,
      normalized.buyUnit,
      normalized.buyUnitCost,
      normalized.qtyPerUnit,
      normalized.itemSizeLabel,
      normalized.stockQuantityItems,
      normalized.reorderLevelItems,
      itemUnitCost,
      ts,
      syncStatus,
    ]
  );
  await syncProductStockMirror(db, productId, normalized.stockQuantityItems, ts, syncStatus);
}

/** Keep legacy products.stock aligned with stock_quantity_items for older code paths. */
export async function syncProductStockMirror(db, productId, stockQuantityItems, ts, syncStatus) {
  const stock = Math.max(0, parseInt(stockQuantityItems, 10) || 0);
  await dbExecute(
    db,
    `UPDATE products SET stock = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
    [stock, ts, syncStatus, productId]
  );
}

/**
 * Deduct or add single base items (never whole buy units).
 * @param {number} delta - negative to deduct, positive to add
 */
export async function adjustStockQuantityItems(db, productId, delta, ts) {
  const rows = await dbSelect(
    db,
    `SELECT stock_quantity_items FROM inventory_breakdown WHERE product_id = ?`,
    [productId]
  );
  const current = Math.max(0, parseInt(rows[0]?.stock_quantity_items, 10) || 0);
  const next = Math.max(0, current + delta);

  if (rows.length) {
    await dbExecute(
      db,
      `UPDATE inventory_breakdown
       SET stock_quantity_items = ?, updated_at = ?, sync_status = ?
       WHERE product_id = ?`,
      [next, ts, SYNC_STATUS.PENDING, productId]
    );
  } else {
    await upsertInventoryBreakdown(
      db,
      productId,
      { stockQuantityItems: next },
      ts,
      SYNC_STATUS.PENDING
    );
    return next;
  }

  await syncProductStockMirror(db, productId, next, ts, SYNC_STATUS.PENDING);
  return next;
}
