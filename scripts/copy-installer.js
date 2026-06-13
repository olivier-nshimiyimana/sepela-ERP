/**
 * Copies built installers into release/installer for easy distribution.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const outDir = join(root, "release", "installer");

if (!existsSync(bundleDir)) {
  console.warn("[copy-installer] No bundle folder yet — run build:installer first.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const sub of ["nsis", "msi"]) {
  const dir = join(bundleDir, sub);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!/Sepela ERP_.*\.(exe|msi)$/i.test(name)) continue;
    const src = join(dir, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(outDir, name));
    copied += 1;
    console.log(`[copy-installer] ${name}`);
  }
}

if (copied === 0) {
  console.warn("[copy-installer] No installer files found in bundle folder.");
} else {
  console.log(`[copy-installer] Ready in release/installer (${copied} file(s))`);
}
