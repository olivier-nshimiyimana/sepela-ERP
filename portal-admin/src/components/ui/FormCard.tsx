import type { FormEvent, ReactNode } from "react";

type FormCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
};

export function FormCard({
  eyebrow,
  title,
  description,
  children,
  onSubmit,
  actions,
  onClose,
  className = "",
}: FormCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 pb-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-400">{eyebrow}</p>
          ) : null}
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
          {description ? <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{description}</p> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="pt-4 space-y-4">{children}</div>

      {actions ? <div className="flex flex-wrap items-center justify-end gap-2 pt-2">{actions}</div> : null}
    </>
  );

  const shellClassName =
    `rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/95 via-slate-950/98 to-slate-950 p-5 shadow-2xl shadow-slate-950/50 ${className}`.trim();

  if (onSubmit) {
    return (
      <form className={shellClassName} onSubmit={onSubmit}>
        {body}
      </form>
    );
  }

  return <section className={shellClassName}>{body}</section>;
}

export function FormGrid({
  children,
  columns = 2,
  className = "",
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const colClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 md:grid-cols-3"
        : columns === 4
          ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
          : "grid-cols-1 md:grid-cols-2";

  return <div className={`grid gap-4 ${colClass} ${className}`.trim()}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
