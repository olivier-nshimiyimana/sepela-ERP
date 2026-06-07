import { LOCALES } from "../i18n";
import { useLocale } from "../contexts/LocaleContext";

export default function LanguagePicker({ value, onChange }) {
  const { t } = useLocale();

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
        {t("language.label")}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(LOCALES.FR)}
          className={`py-3 px-3 rounded-lg border text-left transition-colors ${
            value === LOCALES.FR
              ? "border-blue-500 bg-blue-950/30 text-white"
              : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
          }`}
        >
          <span className="block text-sm font-bold">{t("language.french")}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(LOCALES.EN)}
          className={`py-3 px-3 rounded-lg border text-left transition-colors ${
            value === LOCALES.EN
              ? "border-blue-500 bg-blue-950/30 text-white"
              : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
          }`}
        >
          <span className="block text-sm font-bold">{t("language.english")}</span>
        </button>
      </div>
      <p className="text-[11px] text-gray-500">{t("language.hint")}</p>
    </div>
  );
}
