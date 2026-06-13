import { downloadDir, join } from "@tauri-apps/api/path";
import { isTauriRuntime } from "../db/client";

export function sanitizePdfFilename(filename) {
  const base = String(filename ?? "document")
    .replace(/[/\\:*?"<>|]/g, "-")
    .trim()
    .slice(0, 120) || "document";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export function isFsPermissionError(error) {
  const message = String(error?.message ?? error ?? "");
  return /not allowed|fs\.write_file|permission/i.test(message);
}

export function formatPdfSaveError(error) {
  if (isFsPermissionError(error)) {
    return { key: "notification.documentSaveDenied" };
  }
  const raw = String(error?.message ?? error ?? "Unknown error");
  const short = raw.split("\n")[0].trim().slice(0, 240);
  return { key: "notification.documentSaveFailed", params: { error: short } };
}

/**
 * Save a jsPDF document. In Tauri opens a save dialog and returns the full path.
 * In the browser triggers a download and returns the filename only.
 * Returns null when the user cancels the save dialog.
 */
export async function savePdfDocument(doc, filename, options = {}) {
  const safeName = sanitizePdfFilename(filename);
  const { dialogTitle } = options;

  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    let defaultPath = safeName;
    try {
      defaultPath = await join(await downloadDir(), safeName);
    } catch {
      /* use filename only */
    }

    const path = await save({
      defaultPath,
      title: dialogTitle || undefined,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return null;

    const buffer = doc.output("arraybuffer");
    await writeFile(path, new Uint8Array(buffer));
    return path;
  }

  doc.save(safeName);
  return safeName;
}
