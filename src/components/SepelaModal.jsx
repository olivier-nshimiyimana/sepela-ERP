import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocale } from "../contexts/LocaleContext";

export default function SepelaModal({
  isOpen,
  onClose,
  title,
  icon: Icon,
  iconClassName = "text-sepela-accent",
  children,
  className = "",
  bodyClassName = "sepela-modal-body sepela-scroll",
  inset = false,
  maxWidth = "max-w-2xl",
  zClass = "",
  portal = false,
  fullscreen = false,
  titleId,
  subtitle,
}) {
  const { t } = useLocale();

  if (!isOpen) return null;

  const modal = (
    <div
      className={`sepela-modal-overlay ${inset ? "sepela-modal-overlay--inset" : ""} ${fullscreen ? "sepela-modal-overlay--fullscreen" : ""} ${zClass}`.trim()}
    >
      {!fullscreen ? (
        <button
          type="button"
          className="sepela-modal-backdrop"
          aria-label={t("common.close")}
          onClick={onClose}
        />
      ) : null}
      <div
        className={`sepela-modal w-full ${fullscreen ? "sepela-modal--fullscreen" : maxWidth} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {title ? (
          <div className="sepela-modal-header">
            <div className="min-w-0">
              <h3 id={titleId} className="sepela-modal-title">
                {Icon ? <Icon size={fullscreen ? 22 : 18} className={iconClassName} /> : null}
                {title}
              </h3>
              {subtitle ? <p className="sepela-hint mt-1">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="text-sepela-muted hover:text-white shrink-0"
            >
              <X size={fullscreen ? 22 : 18} />
            </button>
          </div>
        ) : null}
        {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
      </div>
    </div>
  );

  if (portal && typeof document !== "undefined") {
    return createPortal(modal, document.body);
  }

  return modal;
}
