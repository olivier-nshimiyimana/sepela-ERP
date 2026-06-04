/**
 * Copies legal EULA files into installer and web public folders.
 * Regenerates RTF license files (English, French, bilingual for NSIS/MSI).
 *
 * MSI (WiX) requires Windows-1252-safe text in the license RTF — no box-drawing
 * or Unicode punctuation outside that code page.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const enPath = join(root, "legal", "EULA.txt");
const frPath = join(root, "legal", "EULA.fr.txt");
const enText = readFileSync(enPath, "utf8");
const frText = readFileSync(frPath, "utf8");

/** Characters safe for WiX MSI license dialogs (code page 1252). */
function toMsiSafeText(text) {
  return text
    .replace(/\u2550+/g, (m) => "=".repeat(Math.min(m.length, 40)))
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function escapeRtf(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .join("\\par\n");
}

function toRtf(body, title = "") {
  const safe = toMsiSafeText(body);
  const header = title ? `{\\b ${escapeRtf(toMsiSafeText(title))}}\\par\\par\n` : "";
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Arial;}}\\f0\\fs20\n${header}${escapeRtf(safe)}\n}`;
}

const bilingualText = [
  "========================================",
  "ENGLISH - END USER LICENSE AGREEMENT",
  "========================================",
  "",
  enText.trim(),
  "",
  "========================================",
  "FRANCAIS - CONTRAT DE LICENCE UTILISATEUR",
  "========================================",
  "",
  frText.trim(),
].join("\n");

const installerDir = join(root, "src-tauri", "installer");
const publicLegalDir = join(root, "public", "legal");

mkdirSync(installerDir, { recursive: true });
mkdirSync(publicLegalDir, { recursive: true });

copyFileSync(enPath, join(installerDir, "EULA.txt"));
copyFileSync(frPath, join(installerDir, "EULA.fr.txt"));
copyFileSync(enPath, join(publicLegalDir, "EULA.txt"));
copyFileSync(frPath, join(publicLegalDir, "EULA.fr.txt"));

writeFileSync(join(installerDir, "EULA.en.rtf"), toRtf(enText.trim()), "utf8");
writeFileSync(join(installerDir, "EULA.fr.rtf"), toRtf(frText.trim()), "utf8");
writeFileSync(join(installerDir, "EULA.rtf"), toRtf(bilingualText), "utf8");

console.log(
  "Synced EULA (EN + FR, MSI-safe RTF) -> src-tauri/installer, public/legal"
);
