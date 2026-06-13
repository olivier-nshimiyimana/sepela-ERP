import { config } from "../config.js";
import { recordPortalAudit } from "./auditLog.js";

const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

type IpTracker = {
  count: number;
  windowStart: number;
  lastAlertAt: number | null;
};

const failuresByIp = new Map<string, IpTracker>();

function readTracker(ip: string, now: number): IpTracker {
  const existing = failuresByIp.get(ip);
  if (!existing || now - existing.windowStart > config.LOGIN_SPIKE_WINDOW_MS) {
    const fresh = { count: 0, windowStart: now, lastAlertAt: null };
    failuresByIp.set(ip, fresh);
    return fresh;
  }
  return existing;
}

export async function trackLoginFailure(ip: string, username?: string | null): Promise<void> {
  const now = Date.now();
  const tracker = readTracker(ip, now);
  tracker.count += 1;

  if (tracker.count < config.LOGIN_SPIKE_THRESHOLD) return;

  if (tracker.lastAlertAt && now - tracker.lastAlertAt < ALERT_COOLDOWN_MS) return;

  tracker.lastAlertAt = now;
  const details = {
    ip,
    failuresInWindow: tracker.count,
    windowMinutes: Math.round(config.LOGIN_SPIKE_WINDOW_MS / 60_000),
    attemptedUsername: username ?? null,
  };

  await recordPortalAudit({
    adminUsername: username ?? null,
    action: "security_alert",
    method: "POST",
    path: "/admin/auth/login",
    ipAddress: ip,
    statusCode: 401,
    details,
  });

  if (config.PORTAL_SECURITY_WEBHOOK_URL) {
    void postSecurityWebhook({
      type: "login_spike",
      ip,
      failuresInWindow: tracker.count,
      attemptedUsername: username ?? null,
      at: new Date().toISOString(),
    });
  }
}

async function postSecurityWebhook(payload: Record<string, unknown>) {
  try {
    await fetch(config.PORTAL_SECURITY_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort external alert; audit log remains the source of truth.
  }
}

export function auditRowsToCsv(
  rows: Array<{
    createdAt: string;
    adminUsername: string | null;
    action: string;
    method: string;
    path: string;
    statusCode: number | null;
    ipAddress: string | null;
    targetType: string | null;
    targetId: string | null;
  }>
) {
  const header = ["created_at", "admin_username", "action", "method", "path", "status_code", "ip_address", "target_type", "target_id"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.createdAt),
        csvCell(row.adminUsername),
        csvCell(row.action),
        csvCell(row.method),
        csvCell(row.path),
        csvCell(row.statusCode),
        csvCell(row.ipAddress),
        csvCell(row.targetType),
        csvCell(row.targetId),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
