import { createPortal } from "react-dom";
import { CheckCircle2, X, XCircle } from "lucide-react";

const Box = "d" + "iv";

export default function SepelaNotificationStack({ toasts = [], onDismiss }) {
  if (!toasts.length || typeof document === "undefined") return null;

  return createPortal(
    <Box className="sepela-notify-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const Icon = isError ? XCircle : CheckCircle2;

        return (
          <Box
            key={toast.id}
            className={`sepela-notify ${isError ? "sepela-notify--error" : "sepela-notify--success"}`}
            role="status"
          >
            <Icon size={18} className="sepela-notify__icon" aria-hidden />
            <p className="sepela-notify__text">{toast.message}</p>
            <button
              type="button"
              className="sepela-notify__close"
              onClick={() => onDismiss?.(toast.id)}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </Box>
        );
      })}
    </Box>,
    document.body
  );
}
