/** Phrases kept exactly as written during English title formatting. */
const PRESERVE_PHRASES = [
  "Sepela ERP",
  "Sepela Inc.",
  "Sepela Inc",
  "End User License Agreement",
  "Terms of Use",
  "RT_TRAINING_SALES",
  "portal-admin",
  "portal-api",
  "VITE_PORTAL_API_TOKEN",
  "PORTAL_BEARER_TOKEN",
];

const PRESERVE_WORDS = new Set([
  "ERP",
  "Inc",
  "PDF",
  "PNG",
  "JPEG",
  "WebP",
  "API",
  "JSON",
  "CDF",
  "USD",
  "EBM",
  "SDC",
  "POS",
  "RCCM",
  "DRC",
  "SEP",
  "A4",
  "SQL",
  "URL",
  "RT",
  "FC",
  "VITE",
  "PORTAL",
  "BEARER",
  "TOKEN",
  "ENV",
  "I",
  "XML",
  "WA",
  "WhatsApp",
  "Sepela",
  "EULA",
  "MB",
  "mm",
  "DNP",
  "UUID",
  "SQLite",
  "Tauri",
  "npm",
  "dev",
]);

/**
 * Title-case short English UI strings (labels, buttons). Skips long prose and technical paths.
 */
export function formatEnglishUiText(text) {
  if (!text || typeof text !== "string") return text;
  if (text.length > 96) return text;
  if (/[\\/]{1}|\.env|npm run|@[\w-]+\/|:\/\/|D:\\|C:\\/i.test(text)) return text;

  let masked = text;
  const slots = [];
  PRESERVE_PHRASES.forEach((phrase, index) => {
    if (!masked.includes(phrase)) return;
    const token = `\x01${index}\x01`;
    slots[index] = phrase;
    masked = masked.split(phrase).join(token);
  });

  masked = masked.replace(/\b([A-Za-z][A-Za-z'’\-]*)\b/g, (word) => {
    if (PRESERVE_WORDS.has(word)) return word;
    if (word.length >= 2 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return masked.replace(/\x01(\d+)\x01/g, (_, index) => slots[Number(index)] ?? "");
}

/** Title-case user-entered labels (client names, etc.) without altering emails or phone numbers. */
export function formatDisplayTitle(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/\S+/g, (word) => {
    if (word.includes("@") || word.includes(".") && word.includes("@")) return word;
    if (/^\+?[\d(]/.test(word)) return word;
    if (word === word.toUpperCase() && word.length >= 2) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}
