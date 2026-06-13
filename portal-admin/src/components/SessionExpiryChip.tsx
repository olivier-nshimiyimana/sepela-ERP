import { useSessionExpiry } from "../hooks/useSessionExpiry";

type SessionExpiryChipProps = {
  sessionExpiresAt: string | null;
  onExpired: () => void;
  onExtendSession?: () => Promise<void>;
};

export function SessionExpiryChip({ sessionExpiresAt, onExpired, onExtendSession }: SessionExpiryChipProps) {
  const expiry = useSessionExpiry(sessionExpiresAt, onExpired, onExtendSession);

  return (
    <div className={`session-expiry session-expiry--${expiry.tone}`}>
      <span>{expiry.label}</span>
      {expiry.showExtend && onExtendSession ? (
        <button
          type="button"
          className="ghost-button sm"
          onClick={() => void expiry.extendSession()}
          disabled={expiry.extending}
        >
          {expiry.extending ? "…" : "Stay signed in"}
        </button>
      ) : null}
    </div>
  );
}
