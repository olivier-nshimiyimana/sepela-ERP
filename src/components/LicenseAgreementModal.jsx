import { useEffect, useState } from "react";
import { EULA_VERSION, getEulaText } from "../legal/license";
import { DEFAULT_LOCALE, LOCALES, translate } from "../i18n";

export default function LicenseAgreementModal({ onAccept }) {
  const [checked, setChecked] = useState(false);
  const [language, setLanguage] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key, params) => translate(key, language, params);

  return (
    <div className="sepela-modal-overlay">
      <div className="sepela-modal-backdrop" aria-hidden="true" />
      <div
        className="sepela-modal w-full max-w-2xl max-h-[90vh]"
        role="dialog"
        aria-labelledby="eula-title"
        aria-modal="true"
      >
        <header className="sepela-modal-header !flex-col !items-stretch gap-3 !py-4">
          <h1 id="eula-title" className="sepela-modal-title text-base">
            {t("license.title")}
          </h1>
          <p className="sepela-hint">{t("license.subtitle", { version: EULA_VERSION })}</p>
          <div className="sepela-field">
            <label className="sepela-label">{t("language.label")}</label>
            <div className="sepela-choice-grid">
              <button
                type="button"
                onClick={() => setLanguage(LOCALES.FR)}
                className={`sepela-choice ${language === LOCALES.FR ? "sepela-choice--active" : ""}`}
              >
                <span className="sepela-choice__title">{translate("language.french", LOCALES.FR)}</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage(LOCALES.EN)}
                className={`sepela-choice ${language === LOCALES.EN ? "sepela-choice--active" : ""}`}
              >
                <span className="sepela-choice__title">{translate("language.english", LOCALES.EN)}</span>
              </button>
            </div>
            <p className="sepela-hint">{t("language.hint")}</p>
          </div>
        </header>

        <div className="sepela-modal-body sepela-scroll min-h-0">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-sepela-muted">
            {getEulaText(language).trim()}
          </pre>
        </div>

        <footer className="space-y-4 border-t border-sepela-border bg-sepela-bg px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-sepela-muted">
            <input
              type="checkbox"
              className="sepela-checkbox mt-1"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>{t("license.agreeCheckbox")}</span>
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={!checked}
              onClick={() => onAccept(language)}
              className="sepela-btn-primary !w-auto px-5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("license.continue")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
