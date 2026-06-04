import type { FormEvent, ReactNode } from "react";

type ManageModalProps = {
  title: string;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

export function ManageModal({ title, open, busy, onClose, onSubmit, children }: ManageModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="ghost-button sm" onClick={onClose}>
            Close
          </button>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          {children}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
