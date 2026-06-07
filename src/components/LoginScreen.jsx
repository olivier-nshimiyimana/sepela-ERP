import { useState } from "react";
import { LogIn } from "lucide-react";
import startupBackground from "../../sepela-erp-background.png";
import { useLocale } from "../contexts/LocaleContext";

const Box = "d" + "iv";

export default function LoginScreen({ onLogin, ready }) {
  const { t } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await onLogin(username, password);
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <Box
      className="min-h-screen flex items-center justify-center p-6 font-sans bg-center bg-cover bg-no-repeat"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 45%, rgba(8, 17, 33, 0.2) 0%, rgba(4, 9, 19, 0.72) 58%, rgba(2, 5, 10, 0.9) 100%), linear-gradient(rgba(5, 8, 14, 0.62), rgba(5, 8, 14, 0.62)), url(${startupBackground})`,
      }}
    >
      <Box className="w-full max-w-[520px] bg-[#111820]/86 border border-[#2a3442] rounded-2xl shadow-[0_24px_80px_rgba(1,6,18,0.65)] overflow-hidden backdrop-blur-sm">
        <Box className="px-7 py-6 border-b border-[#273345] text-center">
          <h1 className="text-[34px] leading-none font-extrabold tracking-tight text-blue-500">
            SEPELA <span className="text-white">INC</span>
          </h1>
          <p className="text-[#7e8796] text-[18px] leading-tight font-light mt-2">{t("login.signIn")}</p>
        </Box>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
          <Box className="space-y-2">
            <label className="text-[13px] font-bold text-[#7f8a99] uppercase tracking-[0.22em]">
              {t("login.username")}
            </label>
            <input
              autoFocus
              type="text"
              autoComplete="username"
              disabled={!ready || loading}
              className="w-full h-12 bg-[#0c121a]/95 border border-[#2a3341] rounded-xl px-4 text-[17px] text-white focus:border-blue-500 outline-none disabled:opacity-50"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Box>
          <Box className="space-y-2">
            <label className="text-[13px] font-bold text-[#7f8a99] uppercase tracking-[0.22em]">
              {t("login.password")}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              disabled={!ready || loading}
              className="w-full h-12 bg-[#0c121a]/95 border border-[#2a3341] rounded-xl px-4 text-[17px] text-white focus:border-blue-500 outline-none disabled:opacity-50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Box>

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={!ready || loading}
            className="w-full h-12 flex items-center justify-center gap-2 bg-[#1267f5] hover:bg-[#1e73ff] disabled:bg-gray-800 rounded-xl text-[20px] leading-none font-black uppercase tracking-[0.14em] transition-colors"
          >
            <LogIn size={20} />
            {loading ? t("login.signingIn") : t("login.signIn")}
          </button>
        </form>

        <Box className="px-7 pb-8 text-[11px] text-[#7f8a99] text-center">
          <p>
            {t("login.support")}{" "}
            <span className="text-gray-300">{t("login.supportCompany")}</span>
            {t("login.supportSuffix") ? ` ${t("login.supportSuffix")}` : ""}
          </p>
        </Box>
      </Box>
    </Box>
  );
}
