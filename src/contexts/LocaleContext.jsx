import { createContext, useContext, useEffect, useMemo } from "react";
import { DEFAULT_LOCALE, LOCALE_OPTIONS, normalizeLocale, translate, translateUserError } from "../i18n";

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  t: (key) => key,
  tError: (error) => error ?? "",
  localeOptions: LOCALE_OPTIONS,
});

export function LocaleProvider({ locale = DEFAULT_LOCALE, children }) {
  const normalized = normalizeLocale(locale);

  useEffect(() => {
    document.documentElement.lang = normalized;
  }, [normalized]);

  const value = useMemo(
    () => ({
      locale: normalized,
      t: (key, params) => translate(key, normalized, params),
      tError: (error) => translateUserError(error, normalized),
      localeOptions: LOCALE_OPTIONS,
    }),
    [normalized]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
