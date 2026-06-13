import { useEffect, useMemo, useRef, useState } from "react";

const SESSION_EXPIRY_KEY = "sepela-portal-admin-session-expires-at";
const WARN_MS = 30 * 60 * 1000;
const URGENT_MS = 5 * 60 * 1000;

type SessionExpiryState = {
  label: string;
  tone: "ok" | "warn" | "urgent" | "expired";
  msRemaining: number;
};

function formatRemaining(ms: number) {
  if (ms <= 0) return "Expired";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes >= 120) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (totalMinutes >= 60) {
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }
  return `${totalMinutes}m`;
}

export function readStoredSessionExpiry() {
  const raw = sessionStorage.getItem(SESSION_EXPIRY_KEY);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : raw;
}

export function storeSessionExpiry(value: string | null) {
  if (!value) {
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_EXPIRY_KEY, value);
}

export function useSessionExpiry(
  sessionExpiresAt: string | null,
  onExpired: () => void,
  onExtendSession?: () => Promise<void>
) {
  const [now, setNow] = useState(() => Date.now());
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    storeSessionExpiry(sessionExpiresAt);
  }, [sessionExpiresAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const state = useMemo<SessionExpiryState>(() => {
    if (!sessionExpiresAt) {
      return { label: "No session", tone: "expired", msRemaining: 0 };
    }
    const expiresMs = Date.parse(sessionExpiresAt);
    const msRemaining = expiresMs - now;
    if (msRemaining <= 0) {
      return { label: "Session expired", tone: "expired", msRemaining: 0 };
    }
    const label = `Expires in ${formatRemaining(msRemaining)}`;
    if (msRemaining <= URGENT_MS) return { label, tone: "urgent", msRemaining };
    if (msRemaining <= WARN_MS) return { label, tone: "warn", msRemaining };
    return { label, tone: "ok", msRemaining };
  }, [now, sessionExpiresAt]);

  const expiredHandled = useRef(false);

  useEffect(() => {
    if (state.tone !== "expired" || !sessionExpiresAt) {
      expiredHandled.current = false;
      return;
    }
    if (expiredHandled.current) return;
    expiredHandled.current = true;
    onExpired();
  }, [state.tone, sessionExpiresAt, onExpired]);

  async function extendSession() {
    if (!onExtendSession || extending) return;
    setExtending(true);
    try {
      await onExtendSession();
    } finally {
      setExtending(false);
    }
  }

  return { ...state, extending, extendSession, showExtend: state.tone === "warn" || state.tone === "urgent" };
}
