import { tokenizeSearchQuery } from "../utils/productSearch";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlights query tokens in yellow (case-insensitive). */
export default function HighlightText({ text, searchTerm, className = "" }) {
  const raw = String(text ?? "");
  const tokens = tokenizeSearchQuery(searchTerm);

  if (!tokens.length) {
    return <span className={className}>{raw}</span>;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  const parts = raw.split(pattern).filter((p) => p !== "");

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const hit = tokens.some((t) => part.toLowerCase() === t);
        if (hit) {
          return (
            <mark
              key={`${i}-${part}`}
              className="bg-yellow-400 text-black rounded-sm px-0.5 font-semibold"
            >
              {part}
            </mark>
          );
        }
        return <span key={`${i}-${part}`}>{part}</span>;
      })}
    </span>
  );
}
