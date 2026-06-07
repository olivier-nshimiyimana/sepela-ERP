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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-auto rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            className="rounded-lg border border-slate-600/80 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          {children}
          <div className="flex justify-end gap-2 border-t border-slate-800/80 pt-4">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={busy}
            >
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
