import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../db/client";

const SHELL_BG = { red: 26, green: 26, blue: 26, alpha: 255 };

function nudgeRepaint() {
  const root = document.documentElement;
  root.dataset.repaint = "1";
  requestAnimationFrame(() => {
    delete root.dataset.repaint;
  });
}

export function initWebviewShell() {
  document.documentElement.style.backgroundColor = "#1a1a1a";
  document.body.style.backgroundColor = "#1a1a1a";

  if (!isTauriRuntime()) return;

  const windowApi = getCurrentWindow();
  void windowApi.setBackgroundColor(SHELL_BG).catch(() => {});

  const onWake = () => {
    if (document.hidden) return;
    nudgeRepaint();
  };

  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
}
