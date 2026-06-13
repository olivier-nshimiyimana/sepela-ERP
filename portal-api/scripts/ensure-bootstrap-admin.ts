import dotenv from "dotenv";
import { pool } from "../src/db.ts";
import { bootstrapPortalAdmins } from "../src/migrations/bootstrapPortalAdmins.ts";
import { bootstrapSql } from "../src/schema.ts";

dotenv.config();

async function main() {
  await pool.query(bootstrapSql);
  await bootstrapPortalAdmins(pool);
  const count = await pool.query(`SELECT count(*)::int AS count FROM portal_admins`);
  console.log(`portal_admin_count=${count.rows[0]?.count ?? 0}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
