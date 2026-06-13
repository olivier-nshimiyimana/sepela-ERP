import type { ReactNode } from "react";

export function ReadOnlyBanner() {
  return (
    <div className="readonly-banner" role="status">
      <strong>Read-only access</strong>
      <span>You can view portal data but cannot create, edit, or delete records.</span>
    </div>
  );
}

export function WriteGate({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  if (!allowed) return null;
  return <>{children}</>;
}
