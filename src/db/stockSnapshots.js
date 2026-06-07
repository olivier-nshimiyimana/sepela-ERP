import { newEntityId, nowIso } from "../utils/ids";
import { SYNC_STATUS } from "./schema";
import { dbExecute, dbSelect } from "./sqlParams";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toSnapshotDateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toSnapshotMonthKey(date = new Date()) {
  return toSnapshotDateKey(date).slice(0, 7);
}

export async function loadStockSnapshots(db, merchantCode = "local") {
  const rows = await dbSelect(
    db,
    `SELECT id, snapshot_date, snapshot_month, product_id, product_name, lot_number,
            expiration_date, price, stock, stock_value, updated_at
     FROM stock_snapshots
     WHERE merchant_code = ?
     ORDER BY snapshot_date DESC, product_name ASC`,
    [merchantCode]
  );

  return rows.map((row) => ({
    id: row.id,
    snapshotDate: row.snapshot_date,
    snapshotMonth: row.snapshot_month,
    productId: row.product_id,
    productName: row.product_name,
    lotNumber: row.lot_number,
    expirationDate: row.expiration_date,
    price: row.price,
    stock: row.stock,
    stockValue: row.stock_value,
    updatedAt: row.updated_at,
  }));
}

async function loadCurrentProductsForSnapshot(db, merchantCode) {
  return dbSelect(
    db,
    `SELECT
       p.id, p.name, p.lot_number, p.expiration_date, p.price,
       COALESCE(b.stock_quantity_items, p.stock, 0) AS stock
     FROM products p
     LEFT JOIN inventory_breakdown b ON b.product_id = p.id
     WHERE p.merchant_code = ?
     ORDER BY p.name ASC`,
    [merchantCode]
  );
}

export async function syncDailyStockSnapshot(db, products = null, date = new Date(), merchantCode = "local") {
  const rows = products ?? (await loadCurrentProductsForSnapshot(db, merchantCode));
  const snapshotDate = toSnapshotDateKey(date);
  const snapshotMonth = snapshotDate.slice(0, 7);
  const ts = nowIso();

  if (!rows.length) {
    await dbExecute(db, "DELETE FROM stock_snapshots WHERE snapshot_date = ? AND merchant_code = ?", [
      snapshotDate,
      merchantCode,
    ]);
    return { snapshotDate, count: 0 };
  }

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  await dbExecute(
    db,
    `DELETE FROM stock_snapshots
     WHERE snapshot_date = ?
       AND merchant_code = ?
       AND product_id NOT IN (${placeholders})`,
    [snapshotDate, merchantCode, ...ids]
  );

  for (const row of rows) {
    const stock = parseInt(row.stock ?? 0, 10) || 0;
    const price = parseFloat(row.price ?? 0) || 0;
    await dbExecute(
      db,
      `INSERT INTO stock_snapshots (
        id, snapshot_date, snapshot_month, product_id, product_name, lot_number,
        expiration_date, price, stock, stock_value, merchant_code, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, product_id) DO UPDATE SET
        snapshot_month = excluded.snapshot_month,
        product_name = excluded.product_name,
        lot_number = excluded.lot_number,
        expiration_date = excluded.expiration_date,
        price = excluded.price,
        stock = excluded.stock,
        stock_value = excluded.stock_value,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status`,
      [
        newEntityId("snap"),
        snapshotDate,
        snapshotMonth,
        row.id,
        row.name,
        row.lot_number ?? null,
        row.expiration_date ?? null,
        price,
        stock,
        price * stock,
        merchantCode,
        ts,
        SYNC_STATUS.PENDING,
      ]
    );
  }

  return { snapshotDate, count: rows.length };
}
