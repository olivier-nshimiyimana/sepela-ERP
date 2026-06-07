import { useEffect, useState } from "react";
import { eulaText, EULA_VERSION } from "../legal/license";
import { DEFAULT_LOCALE, LOCALES, translate } from "../i18n";

export default function LicenseAgreementModal({ onAccept }) {
  const [checked, setChecked] = useState(false);
  const [language, setLanguage] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key, params) => translate(key, language, params);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-gray-700 bg-[#141414] shadow-2xl"
        role="dialog"
        aria-labelledby="eula-title"
        aria-modal="true"
      >
        <header className="border-b border-gray-800 px-6 py-4 space-y-3">
          <h1 id="eula-title" className="text-lg font-semibold text-white">
            {t("license.title")}
          </h1>
          <p className="text-sm text-gray-400">{t("license.subtitle", { version: EULA_VERSION })}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {t("language.label")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLanguage(LOCALES.FR)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  language === LOCALES.FR
                    ? "border-blue-500 bg-blue-950/40 text-white"
                    : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
                }`}
              >
                {translate("language.french", LOCALES.FR)}
              </button>
              <button
                type="button"
                onClick={() => setLanguage(LOCALES.EN)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  language === LOCALES.EN
                    ? "border-blue-500 bg-blue-950/40 text-white"
                    : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
                }`}
              >
                {translate("language.english", LOCALES.EN)}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">{t("language.hint")}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-300">
            {eulaText.trim()}
          </pre>
        </div>

        <footer className="space-y-4 border-t border-gray-800 px-6 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-[#0a0a0a] text-blue-600 focus:ring-blue-500"
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
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("license.continue")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
