export const DEFAULT_IDLE_MINUTES = 30;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 240;

export const IDLE_MUSIC_ENABLED_KEY = "sepela-idle-music-enabled";
export const IDLE_MUSIC_VOLUME_KEY = "sepela-idle-music-volume";
export const IDLE_MUSIC_IDLE_MINUTES_KEY = "sepela-idle-music-idle-minutes";
export const IDLE_MUSIC_CHANGED_EVENT = "sepela-idle-music-changed";
export const IDLE_MUSIC_URL = "/Franc%20Congolais.mp3";
export const IDLE_MUSIC_SONG_NAME = "Franc Congolais";

function readBoolean(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function readNumber(key, fallback, min, max) {
  try {
    const stored = Number(localStorage.getItem(key));
    if (!Number.isFinite(stored)) return fallback;
    return Math.min(max, Math.max(min, stored));
  } catch {
    return fallback;
  }
}

export function normalizeIdleMinutes(value, fallback = DEFAULT_IDLE_MINUTES) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, parsed));
}

export function readIdleMusicSettings() {
  return {
    enabled: readBoolean(IDLE_MUSIC_ENABLED_KEY, true),
    volume: readNumber(IDLE_MUSIC_VOLUME_KEY, 0.45, 0, 1),
    idleMinutes: readNumber(
      IDLE_MUSIC_IDLE_MINUTES_KEY,
      DEFAULT_IDLE_MINUTES,
      MIN_IDLE_MINUTES,
      MAX_IDLE_MINUTES
    ),
  };
}

export function idleMusicDelayMs(idleMinutes = readIdleMusicSettings().idleMinutes) {
  return normalizeIdleMinutes(idleMinutes) * 60 * 1000;
}

function notifyIdleMusicChanged() {
  window.dispatchEvent(new CustomEvent(IDLE_MUSIC_CHANGED_EVENT));
}

export function writeIdleMusicSettings(partial = {}) {
  if (partial.enabled !== undefined) {
    localStorage.setItem(IDLE_MUSIC_ENABLED_KEY, String(!!partial.enabled));
  }
  if (partial.volume !== undefined) {
    const next = Math.min(1, Math.max(0, Number(partial.volume)));
    localStorage.setItem(IDLE_MUSIC_VOLUME_KEY, String(next));
  }
  if (partial.idleMinutes !== undefined) {
    localStorage.setItem(
      IDLE_MUSIC_IDLE_MINUTES_KEY,
      String(normalizeIdleMinutes(partial.idleMinutes))
    );
  }
  notifyIdleMusicChanged();
}
