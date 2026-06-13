/**
 * Validates release prerequisites before `npm run build:installer`.
 * Syncs EULA files and checks version alignment across manifests.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`\n[prepare:installer] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[prepare:installer] warning: ${message}`);
}

function ok(message) {
  console.log(`[prepare:installer] ${message}`);
}

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(" ")} failed (exit ${result.status ?? 1})`);
  }
}

function readVersion(filePath, pattern) {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    vars[key] = value;
  }
  return vars;
}

function commandExists(cmd, args = ["--version"]) {
  const result = spawnSync(cmd, args, { stdio: "ignore", shell: true });
  return result.status === 0;
}

function resolvePortalToken() {
  const fromProcess = String(process.env.VITE_PORTAL_API_TOKEN ?? "").trim();
  if (fromProcess) return fromProcess;

  const env = { ...parseEnvFile(join(root, ".env.production")), ...parseEnvFile(join(root, ".env")) };
  return String(env.VITE_PORTAL_API_TOKEN ?? "").trim();
}

const requiredIcons = [
  "src-tauri/icons/icon.ico",
  "src-tauri/icons/icon.png",
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
];

const requiredLegal = ["legal/EULA.txt", "legal/EULA.fr.txt"];

console.log("Preparing Sepela ERP installer build...\n");

if (!commandExists("node")) fail("Node.js is required.");
if (!commandExists("rustc")) fail("Rust toolchain is required (https://rustup.rs/).");
if (!commandExists("cargo")) fail("Cargo is required.");

ok(`node ${spawnSync("node", ["-v"], { encoding: "utf8", shell: true }).stdout.trim()}`);
ok(`rustc ${spawnSync("rustc", ["--version"], { encoding: "utf8", shell: true }).stdout.trim()}`);

for (const rel of requiredIcons) {
  if (!existsSync(join(root, rel))) {
    fail(`Missing ${rel}. Run: npm run icons`);
  }
}
ok("App icons present");

for (const rel of requiredLegal) {
  if (!existsSync(join(root, rel))) {
    fail(`Missing ${rel}`);
  }
}
ok("Legal source files present");

const pkgVersion = readVersion(join(root, "package.json"), /"version"\s*:\s*"([^"]+)"/);
const tauriVersion = readVersion(join(root, "src-tauri", "tauri.conf.json"), /"version"\s*:\s*"([^"]+)"/);
const cargoVersion = readVersion(join(root, "src-tauri", "Cargo.toml"), /^version\s*=\s*"([^"]+)"/m);

if (!pkgVersion || !tauriVersion || !cargoVersion) {
  fail("Could not read version from package.json, tauri.conf.json, or Cargo.toml");
}
if (pkgVersion !== tauriVersion || pkgVersion !== cargoVersion) {
  fail(
    `Version mismatch: package.json=${pkgVersion}, tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion}`
  );
}
ok(`Version aligned at ${pkgVersion}`);

const portalToken = resolvePortalToken();
if (!portalToken) {
  fail(
    "VITE_PORTAL_API_TOKEN is not set. Add it to .env (or .env.production / CI env) — must match portal-api PORTAL_BEARER_TOKEN."
  );
}
ok("VITE_PORTAL_API_TOKEN is set");

if (!existsSync(join(root, "node_modules"))) {
  warn("node_modules missing — run npm install first");
}

if (!commandExists("python", ["--version"]) && !commandExists("py", ["--version"])) {
  warn("Python not found — skip npm run icons unless you change appicon.png manually");
}

console.log("\nSyncing EULA...");
run("node", ["scripts/sync-legal.js"]);

const eulaRtf = join(root, "src-tauri", "installer", "EULA.rtf");
if (!existsSync(eulaRtf)) {
  fail("EULA.rtf was not generated — check legal/EULA*.txt");
}
ok("EULA synced to src-tauri/installer");

console.log("\nAll checks passed.");
ok("Next: npm run build:installer  (or npm run build:win for NSIS only)");
