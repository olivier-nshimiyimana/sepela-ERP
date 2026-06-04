import type { Pool } from "pg";

function slugMerchantCode(code: string) {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export async function migrateOperatorUsernameGlobal(pool: Pool): Promise<void> {
  const dupes = await pool.query<{ username: string }>(
    `SELECT LOWER(username) AS username
     FROM operators
     GROUP BY LOWER(username)
     HAVING COUNT(*) > 1`
  );

  for (const row of dupes.rows) {
    const accounts = await pool.query<{ id: string; username: string; merchant_code: string }>(
      `SELECT o.id, o.username, m.code AS merchant_code
       FROM operators o
       JOIN merchants m ON m.id = o.merchant_id
       WHERE LOWER(o.username) = LOWER($1)
       ORDER BY o.created_at ASC, o.id ASC`,
      [row.username]
    );

    for (let i = 1; i < accounts.rows.length; i += 1) {
      const account = accounts.rows[i];
      const base = row.username.slice(0, 48);
      const suffix = slugMerchantCode(account.merchant_code) || `m${i}`;
      let candidate = `${base}-${suffix}`.slice(0, 80);
      let attempt = 0;
      while (attempt < 5) {
        const clash = await pool.query(`SELECT 1 FROM operators WHERE LOWER(username) = LOWER($1) LIMIT 1`, [
          candidate,
        ]);
        if (!clash.rows[0]) break;
        attempt += 1;
        candidate = `${base}-${suffix}-${attempt}`.slice(0, 80);
      }
      await pool.query(`UPDATE operators SET username = $1, updated_at = NOW() WHERE id = $2`, [
        candidate,
        account.id,
      ]);
    }
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_username_global
    ON operators (LOWER(username))
  `);
}
