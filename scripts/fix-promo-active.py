"""Activate walk-in promotions: clear tier, widen date window."""
import os
import sqlite3
from datetime import datetime, timezone

DB_PATHS = [
    r"D:\SepelaERP\data\sepela.db",
    r"C:\SepelaERP\data\sepela.db",
]


def resolve_db():
    for path in DB_PATHS:
        if os.path.isfile(path):
            return path
    return DB_PATHS[1]


def main():
    db = resolve_db()
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    cur.execute(
        """UPDATE promotions
           SET client_tier = NULL,
               start_date = '2020-01-01T00:00:00.000Z',
               end_date = '2030-12-31T23:59:59.000Z',
               updated_at = ?,
               sync_status = 'PENDING'
           WHERE target_scope = 'all_products'""",
        (ts,),
    )
    conn.commit()
    cur.execute(
        "SELECT name, client_tier, min_order_amount, discount_value, start_date, end_date FROM promotions"
    )
    for row in cur.fetchall():
        print(row)
    conn.close()
    print(f"Updated promotions in {db}")


if __name__ == "__main__":
    main()
