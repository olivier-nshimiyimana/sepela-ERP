"""Create product_categories / promotions tables on an existing sepela.db (schema v9)."""
import os
import sqlite3

PRODUCT_CATEGORIES_DDL = """CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  merchant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
  UNIQUE (merchant_code, code)
)"""

PROMOTIONS_DDL = """CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  merchant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  target_scope TEXT NOT NULL CHECK (target_scope IN ('all_products', 'specific_category', 'specific_product')),
  category_id TEXT,
  product_id TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value REAL NOT NULL CHECK (discount_value >= 0),
  client_tier TEXT,
  min_order_amount REAL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
)"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_product_categories_merchant ON product_categories(merchant_code)",
    "CREATE INDEX IF NOT EXISTS idx_product_categories_sync ON product_categories(sync_status)",
    "CREATE INDEX IF NOT EXISTS idx_promotions_merchant ON promotions(merchant_code)",
    "CREATE INDEX IF NOT EXISTS idx_promotions_sync ON promotions(sync_status)",
    "CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(merchant_code, is_active, start_date, end_date)",
]

EXTRA_COLUMNS = [
    ("products", "category_id", "TEXT"),
    ("customers", "client_tier", "TEXT"),
    ("sales", "promotion_discount_usd", "REAL DEFAULT 0"),
    ("sales", "applied_promotion_id", "TEXT"),
]


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


def table_has_column(cur, table, column):
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def ensure_column(cur, table, column, definition):
    if not table_has_column(cur, table, column):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def main():
    db_path = resolve_db_path()
    if not os.path.isfile(db_path):
        print(f"Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute(PRODUCT_CATEGORIES_DDL)
    cur.execute(PROMOTIONS_DDL)
    for sql in INDEXES:
        cur.execute(sql)

    for table, column, definition in EXTRA_COLUMNS:
        ensure_column(cur, table, column, definition)

    conn.commit()
    conn.close()
    print(f"Promotion schema repaired: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
