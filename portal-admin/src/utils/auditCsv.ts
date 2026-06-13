import type { AuditLogEntry } from "../types";

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function auditEntriesToCsv(entries: AuditLogEntry[]) {
  const header = [
    "created_at",
    "admin_username",
    "action",
    "method",
    "path",
    "status_code",
    "ip_address",
    "target_type",
    "target_id",
  ];
  const lines = [header.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        csvCell(entry.createdAt),
        csvCell(entry.adminUsername),
        csvCell(entry.action),
        csvCell(entry.method),
        csvCell(entry.path),
        csvCell(entry.statusCode),
        csvCell(entry.ipAddress),
        csvCell(entry.targetType),
        csvCell(entry.targetId),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
