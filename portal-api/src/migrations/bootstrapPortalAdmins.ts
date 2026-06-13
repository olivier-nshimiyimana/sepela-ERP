import type { Pool } from "pg";
import { createSalt, hashPassword } from "../auth/password.js";
import { config } from "../config.js";

export async function bootstrapPortalAdmins(pool: Pool): Promise<void> {
  const existing = await pool.query(`SELECT count(*)::int AS count FROM portal_admins`);
  if ((existing.rows[0]?.count ?? 0) > 0) return;

  const username = config.PORTAL_BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = config.PORTAL_BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;

  const salt = createSalt();
  const passwordHash = hashPassword(password, salt);
  await pool.query(
    `INSERT INTO portal_admins (username, display_name, role, password_salt, password_hash)
     VALUES ($1, $2, 'super_admin', $3, $4)`,
    [username, "Portal Super Admin", salt, passwordHash]
  );
  console.log(`[portal-api] Bootstrap super admin created: ${username}`);
}
