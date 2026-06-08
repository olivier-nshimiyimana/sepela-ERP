"""Rebuild inventory_breakdown without SQLite GENERATED columns (fixes malformed schema)."""
import os
import sqlite3

def resolve_db_path():
    candidates = [
        r"D:\SepelaERP\data\sepela.db",
        r"C:\SepelaERP\data\sepela.db",
        os.path.expandvars(r"%APPDATA%\com.sepela.erp\sepela.db"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return candidates[0]


DB_PATH = resolve_db_path()


def calc_item_unit_cost(buy_unit_cost, qty_per_unit):
    try:
        cost = float(buy_unit_cost)
        qty = int(qty_per_unit)
        return cost / qty if qty > 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def main():
    if not os.path.isfile(DB_PATH):
        print(f"Database not found: {DB_PATH}")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory_breakdown'")
    row = cur.fetchone()
    if not row:
        print("No inventory_breakdown table — nothing to repair.")
        return 0

    ddl = row[0] or ""
    if "GENERATED" not in ddl.upper():
        print("Table already uses a plain item_unit_cost column.")
        return 0

    cur.execute(
        """SELECT product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
                  stock_quantity_items, reorder_level_items, updated_at, sync_status
           FROM inventory_breakdown"""
    )
    rows = cur.fetchall()

    cur.execute("DROP TABLE inventory_breakdown")
    cur.execute(
        """CREATE TABLE inventory_breakdown (
          product_id TEXT PRIMARY KEY,
          buy_unit TEXT NOT NULL DEFAULT 'Unit',
          buy_unit_cost REAL NOT NULL DEFAULT 0,
          qty_per_unit INTEGER NOT NULL DEFAULT 1,
          item_size_label TEXT,
          stock_quantity_items INTEGER NOT NULL DEFAULT 0,
          reorder_level_items INTEGER NOT NULL DEFAULT 0,
          item_unit_cost REAL NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )"""
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_breakdown_sync ON inventory_breakdown(sync_status)"
    )

    for r in rows:
        item_unit_cost = calc_item_unit_cost(r[2], r[3])
        cur.execute(
            """INSERT INTO inventory_breakdown (
               product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
               stock_quantity_items, reorder_level_items, item_unit_cost, updated_at, sync_status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (*r[:7], item_unit_cost, r[7], r[8]),
        )

    cur.execute(
        """INSERT INTO app_meta (key, value, updated_at, sync_status)
           VALUES ('inventory_breakdown_v8', '1', datetime('now'), 'SYNCED')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"""
    )
    cur.execute(
        """INSERT INTO app_meta (key, value, updated_at, sync_status)
           VALUES ('schema_version', '8', datetime('now'), 'SYNCED')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"""
    )
    conn.commit()
    conn.close()
    print(f"Repaired {len(rows)} inventory_breakdown row(s) in {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
