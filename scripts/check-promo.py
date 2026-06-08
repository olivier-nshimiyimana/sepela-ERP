import sqlite3

db = r"C:\SepelaERP\data\sepela.db"
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
c = conn.cursor()
print("=== PROMOTIONS ===")
for r in c.execute(
    "SELECT id, name, target_scope, product_id, category_id, client_tier, "
    "min_order_amount, discount_type, discount_value, start_date, end_date, is_active "
    "FROM promotions"
):
    print(dict(r))
print("=== HEINEKEN PRODUCTS ===")
for r in c.execute(
    "SELECT id, name, lot_number, stock FROM products "
    "WHERE lower(name) LIKE '%heineken%'"
):
    print(dict(r))
print("=== PROMO TARGET PRODUCT ===")
for r in c.execute(
    "SELECT id, name, lot_number, stock FROM products WHERE id = ?",
    ("prd_f4238ab78db3",),
):
    print(dict(r) if r else "NOT FOUND")
conn.close()
