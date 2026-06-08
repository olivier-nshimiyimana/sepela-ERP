/**
 * Pre-deploy check for portal-api (TypeScript compile + promotion migration present).
 * Usage: node scripts/verify-portal-api.js
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const portalApi = path.join(root, "portal-api");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const migrationsFile = path.join(portalApi, "src", "migrations", "promotions.ts");
const serverFile = path.join(portalApi, "src", "server.ts");

if (!fs.existsSync(migrationsFile)) {
  console.error("Missing portal-api promotions migration.");
  process.exit(1);
}

const serverSrc = fs.readFileSync(serverFile, "utf8");
if (!serverSrc.includes("migratePromotions")) {
  console.error("portal-api server.ts does not call migratePromotions.");
  process.exit(1);
}

const migrationSrc = fs.readFileSync(migrationsFile, "utf8");
for (const table of ["sync_promotions", "sync_product_categories"]) {
  if (!migrationSrc.includes(table)) {
    console.error(`Migration missing table: ${table}`);
    process.exit(1);
  }
}

console.log("portal-api: npm run check");
run("npm", ["run", "check"], portalApi);

console.log("portal-api: npm run build");
run("npm", ["run", "build"], portalApi);

console.log("portal-api verification passed.");
