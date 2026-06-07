import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type BaseProps = {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

type InputFieldProps = BaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    as?: "input";
  };

type SelectFieldProps = BaseProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    as: "select";
    children: ReactNode;
  };

export type FormFieldProps = InputFieldProps | SelectFieldProps;

const controlClassName =
  "w-full rounded-xl border border-slate-600/70 bg-slate-950/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 transition focus:border-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50";

function FieldShell({
  label,
  hint,
  required,
  className = "",
  fieldId,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  fieldId: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <label htmlFor={fieldId} className="block text-xs font-semibold tracking-wide text-slate-300">
        {label}
        {required ? <span className="text-rose-400 ml-0.5">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function FormField(props: FormFieldProps) {
  const fieldId = props.id ?? props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (props.as === "select") {
    const { label, hint, required, className, id, as, children, ...rest } = props;
    return (
      <FieldShell label={label} hint={hint} required={required} className={className} fieldId={fieldId}>
        <select id={fieldId} required={required} className={controlClassName} {...rest}>
          {children}
        </select>
      </FieldShell>
    );
  }

  const { label, hint, required, className, id, as, ...rest } = props;
  return (
    <FieldShell label={label} hint={hint} required={required} className={className} fieldId={fieldId}>
      <input id={fieldId} required={required} className={controlClassName} {...rest} />
    </FieldShell>
  );
}
