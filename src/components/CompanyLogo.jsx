import { useEffect, useState } from "react";
import { reprocessLogoDataUrl, sanitizeCompanyLogo } from "../utils/companyLogo";

/** Merchant logo above invoice header text; transparent PNG, no solid backdrop. */
export default function CompanyLogo({ src, alt = "Company logo", compact = false }) {
  const [displaySrc, setDisplaySrc] = useState(() => sanitizeCompanyLogo(src));

  useEffect(() => {
    const safe = sanitizeCompanyLogo(src);
    if (!safe) {
      setDisplaySrc("");
      return;
    }
    if (safe.startsWith("data:image/png")) {
      setDisplaySrc(safe);
      return;
    }

    let cancelled = false;
    reprocessLogoDataUrl(safe).then((processed) => {
      if (!cancelled) setDisplaySrc(processed || safe);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!displaySrc) return null;

  return (
    <img
      src={displaySrc}
      alt={alt}
      style={{
        display: "block",
        maxWidth: compact ? 72 : 120,
        maxHeight: compact ? 36 : 56,
        width: "auto",
        height: "auto",
        objectFit: "contain",
        flexShrink: 0,
        background: "transparent",
      }}
    />
  );
}
