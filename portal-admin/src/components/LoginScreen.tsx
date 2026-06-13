import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type LoginScreenProps = {
  busy: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginScreen({ busy, error, onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [blockAutofill, setBlockAutofill] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setBlockAutofill(false), 120);
    return () => window.clearTimeout(id);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onLogin(username.trim(), password);
  };

  return (
    <div className="portal-login">
      <div className="portal-login__glow portal-login__glow--left" aria-hidden />
      <div className="portal-login__glow portal-login__glow--right" aria-hidden />

      <section className="portal-login__card">
        <div className="portal-login__mark-wrap">
          <img src="/appicon.png?v=4" alt="" className="portal-login__mark" width={52} height={52} />
        </div>

        <p className="portal-login__eyebrow">Sepela</p>
        <h1 className="portal-login__title">Staff portal</h1>

        <span className="portal-login__badge">Staff accounts only</span>

        <form className="portal-login__form" onSubmit={(event) => void submit(event)} autoComplete="off" noValidate>
          <label className="portal-login__field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="your.username"
              autoComplete="off"
              name="sepela-portal-user"
              readOnly={blockAutofill}
              onFocus={() => setBlockAutofill(false)}
              required
              minLength={2}
            />
          </label>

          <label className="portal-login__field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="new-password"
              name="sepela-portal-pass"
              readOnly={blockAutofill}
              onFocus={() => setBlockAutofill(false)}
              required
              minLength={6}
            />
          </label>

          {error ? <p className="portal-login__error">{error}</p> : null}

          <button type="submit" className="portal-login__submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="portal-login__footer">No public sign-up. Contact your super admin for access.</p>
      </section>
    </div>
  );
}
