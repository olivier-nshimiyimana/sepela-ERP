type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function SearchField({ value, onChange, placeholder }: SearchFieldProps) {
  return (
    <label className="search-field block shrink-0">
      <span className="sr-only">{placeholder}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-600/70 bg-slate-950/80 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-black/15 transition focus:border-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
    </label>
  );
}
