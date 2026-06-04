/**
 * Production-only UI hardening (defense in depth alongside Rust init script).
 * Blocks context menu and common devtools / view-source shortcuts in the webview.
 */
if (import.meta.env.PROD) {
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  document.addEventListener("contextmenu", stop, { capture: true });

  document.addEventListener(
    "keydown",
    (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12") return stop(e);
      if (mod && e.shiftKey && ["I", "J", "C"].includes(e.key)) return stop(e);
      if (mod && !e.shiftKey && (e.key === "U" || e.key === "u")) return stop(e);
      // Block Ctrl+S "Save page" in the webview (not app save).
      if (mod && !e.shiftKey && (e.key === "S" || e.key === "s")) return stop(e);
    },
    { capture: true }
  );
}
