import { useEffect, useState } from "react";
import { Button } from "../components/shared/Button.jsx";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";

const LOGIN_COOLDOWN_KEY = "em_login_cooldown_until";
const SUCCESS_COOLDOWN_SECONDS = 45;
const RATE_LIMIT_COOLDOWN_SECONDS = 120;

export function LoginPage() {
  const [loginMode, setLoginMode] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const stored = Number.parseInt(
        localStorage.getItem(LOGIN_COOLDOWN_KEY) || "",
        10,
      );
      if (!Number.isFinite(stored) || stored <= 0) {
        setCooldownRemainingSeconds(0);
        return;
      }
      const remaining = Math.ceil((stored - Date.now()) / 1000);
      if (remaining <= 0) {
        localStorage.removeItem(LOGIN_COOLDOWN_KEY);
        setCooldownRemainingSeconds(0);
        return;
      }
      setCooldownRemainingSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function setCooldown(seconds) {
    const until = Date.now() + seconds * 1000;
    setCooldownRemainingSeconds(seconds);
    localStorage.setItem(LOGIN_COOLDOWN_KEY, String(until));
  }

  async function onSendMagicLink(e) {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      setError(
        "Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      return;
    }

    const value = email.trim();
    if (!value) {
      setError("Enter an email address.");
      return;
    }
    if (loginMode === "magic" && cooldownRemainingSeconds > 0) {
      setError(
        `Please wait ${cooldownRemainingSeconds}s before requesting another magic link.`,
      );
      return;
    }

    setLoading(true);
    if (loginMode === "password") {
      const pwd = password.trim();
      if (!pwd) {
        setLoading(false);
        setError("Enter your password.");
        return;
      }
      const { error: pwdError } = await supabase.auth.signInWithPassword({
        email: value,
        password: pwd,
      });
      setLoading(false);
      if (pwdError) {
        setError(pwdError.message);
      } else {
        setSuccess("Signed in successfully.");
      }
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    });
    setLoading(false);

    if (otpError) {
      if (otpError.message.toLowerCase().includes("rate limit")) {
        setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
        setError(
          `Email rate limit reached. Please wait ${RATE_LIMIT_COOLDOWN_SECONDS}s before trying again.`,
        );
      } else {
        setError(otpError.message);
      }
      return;
    }

    setCooldown(SUCCESS_COOLDOWN_SECONDS);
    setSuccess(
      "Magic link sent. Check your inbox and open the link on this browser.",
    );
  }

  return (
    <div className="em-auth-page">
      <div className="em-auth-card">
        <div className="em-title">OLT Event Manager Login</div>
        <div className="em-subtitle">
          Email + Password or Magic Link
        </div>

        <div className="em-auth-mode">
          <Button
            type="button"
            variant={loginMode === "password" ? "primary" : "ghost"}
            onClick={() => {
              setLoginMode("password");
              setError("");
              setSuccess("");
            }}
            disabled={loading}
          >
            Email + Password
          </Button>
          <Button
            type="button"
            variant={loginMode === "magic" ? "primary" : "ghost"}
            onClick={() => {
              setLoginMode("magic");
              setError("");
              setSuccess("");
            }}
            disabled={loading}
          >
            Magic Link
          </Button>
        </div>

        <form className="em-form em-form--auth" onSubmit={onSendMagicLink}>
          <label className="em-field" htmlFor="em-login-email">
            <div className="em-label">Email</div>
            <input
              id="em-login-email"
              className="em-input"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {loginMode === "password" ? (
            <label className="em-field" htmlFor="em-login-password">
              <div className="em-label">Password</div>
              <input
                id="em-login-password"
                className="em-input"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          ) : null}
          <div className="em-form-actions em-form-actions--auth">
            {loginMode === "magic" ? (
              <Button
                type="submit"
                variant="primary"
                disabled={loading || cooldownRemainingSeconds > 0}
              >
                {loading
                  ? "Sending…"
                  : cooldownRemainingSeconds > 0
                    ? `Retry in ${cooldownRemainingSeconds}s`
                    : "Send Magic Link"}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            )}
          </div>
        </form>

        {loginMode === "magic" && cooldownRemainingSeconds > 0 ? (
          <div className="em-auth-hint">
            Cooldown active to prevent rate-limit errors while debugging.
          </div>
        ) : null}
        {success ? <div className="em-auth-success">{success}</div> : null}
        {error ? <div className="em-auth-error">{error}</div> : null}
      </div>
    </div>
  );
}
