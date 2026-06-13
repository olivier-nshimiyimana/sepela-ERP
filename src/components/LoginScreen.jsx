import { useEffect, useRef, useState } from "react";
import { ArrowRight, Power } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SepelaLoginMark from "./SepelaLoginMark";
import { PLATFORM_COMPANY_NAME } from "../data/platformBranding";
import { isTauriRuntime } from "../db/client";
import { useLocale } from "../contexts/LocaleContext";

const Box = "d" + "iv";

async function exitApplication() {
  if (isTauriRuntime()) {
    await getCurrentWindow().close();
    return;
  }
  window.close();
}

export default function LoginScreen({ onLogin, ready }) {
  const { t, tError } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [blockAutofill, setBlockAutofill] = useState(true);
  const passwordRef = useRef(null);
  const usernameRef = useRef(null);

  useEffect(() => {
    const id = window.setTimeout(() => setBlockAutofill(false), 120);
    return () => window.clearTimeout(id);
  }, []);

  const submit = async () => {
    if (!ready || loading) return;
    setError("");
    setLoading(true);
    const result = await onLogin(username, password);
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submit();
  };

  const handleUsernameKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      passwordRef.current?.focus();
    }
  };

  return (
    <Box className="sepela-login">
      <button
        type="button"
        className="sepela-login__power"
        onClick={() => void exitApplication()}
        aria-label={t("login.exitApp")}
        title={t("login.exitApp")}
      >
        <Power size={22} strokeWidth={1.75} />
      </button>

      <Box className="sepela-login__center">
        <SepelaLoginMark size={76} />

        <h1 className="sepela-login__brand">{PLATFORM_COMPANY_NAME}</h1>

        <p className="sepela-login__title">{t("login.title")}</p>

        <form
          onSubmit={handleSubmit}
          className="sepela-login__form"
          noValidate
          autoComplete="off"
        >
          <input
            type="text"
            name="sepela-login-trap"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            className="sepela-login__trap"
          />
          <Box className="sepela-login__field">
            <input
              ref={usernameRef}
              autoFocus
              type="text"
              name="sepela-operator-id"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              readOnly={blockAutofill}
              disabled={!ready || loading}
              className="sepela-input sepela-login__input"
              placeholder={t("login.usernamePlaceholder")}
              aria-label={t("login.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              onFocus={(e) => {
                setBlockAutofill(false);
                e.target.removeAttribute("readonly");
              }}
            />
          </Box>

          <Box className="sepela-login__field sepela-login__field--submit">
            <input
              ref={passwordRef}
              type="password"
              name="sepela-operator-secret"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              readOnly={blockAutofill}
              disabled={!ready || loading}
              className="sepela-input sepela-login__input"
              placeholder={t("login.passwordPlaceholder")}
              aria-label={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={(e) => {
                setBlockAutofill(false);
                e.target.removeAttribute("readonly");
              }}
            />
            <button
              type="submit"
              disabled={!ready || loading}
              className="sepela-login__submit"
              aria-label={loading ? t("login.signingIn") : t("login.signIn")}
              title={loading ? t("login.signingIn") : t("login.signIn")}
            >
              <ArrowRight size={22} strokeWidth={2} />
            </button>
          </Box>

          {error ? (
            <p className="sepela-login__error" role="alert">
              {tError(error)}
            </p>
          ) : null}

          {loading ? (
            <p className="sepela-login__status">{t("login.signingIn")}</p>
          ) : null}
        </form>

        <button
          type="button"
          className="sepela-login__forgot"
          onClick={() => setShowForgotHint((v) => !v)}
        >
          {t("login.forgotPassword")}
        </button>

        {showForgotHint ? (
          <Box className="sepela-login__support">
            <p>{t("login.forgotPasswordHint")}</p>
            <p>
              {t("login.support")}{" "}
              <span className="sepela-login__support-name">{t("login.supportCompany")}</span>
              {t("login.supportSuffix") ? ` ${t("login.supportSuffix")}` : ""}
            </p>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
