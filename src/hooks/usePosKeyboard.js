import { useEffect } from "react";

/**
 * Global POS shortcuts when payment modal is closed.
 * F3 or / → focus search; F4 or Enter (outside inputs) → payment; Escape → blur search.
 */
export function usePosKeyboard({
  enabled,
  cartLength,
  onFocusSearch,
  onOpenPayment,
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "F3" || (e.key === "/" && !inField)) {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      if (e.key === "F4" || (e.key === "Enter" && !inField && cartLength > 0)) {
        e.preventDefault();
        onOpenPayment();
        return;
      }

      if (e.key === "Escape" && inField) {
        e.target?.blur?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, cartLength, onFocusSearch, onOpenPayment]);
}
