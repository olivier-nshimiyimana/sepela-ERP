import { LOCALES } from "../i18n";
import { useLocale } from "../contexts/LocaleContext";

export default function LanguagePicker({ value, onChange }) {
  const { t } = useLocale();

  return (
    <div className="sepela-field">
      <label className="sepela-label">{t("language.label")}</label>
      <div className="sepela-choice-grid">
        <button
          type="button"
          onClick={() => onChange(LOCALES.FR)}
          className={`sepela-choice ${value === LOCALES.FR ? "sepela-choice--active" : ""}`}
        >
          <span className="sepela-choice__title">{t("language.french")}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(LOCALES.EN)}
          className={`sepela-choice ${value === LOCALES.EN ? "sepela-choice--active" : ""}`}
        >
          <span className="sepela-choice__title">{t("language.english")}</span>
        </button>
      </div>
      <p className="sepela-hint">{t("language.hint")}</p>
    </div>
  );
}
