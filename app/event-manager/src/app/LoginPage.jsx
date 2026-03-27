import { useState } from "react";
import { Button } from "../components/shared/Button.jsx";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function onSubmitSignIn(e) {
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

    setLoading(true);
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
  }

  return (
    <div className="em-auth-page">
      <div className="em-auth-card">
        <div className="em-title">OLT Event Manager Login</div>

        <form className="em-form em-form--auth" onSubmit={onSubmitSignIn}>
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
          <div className="em-form-actions em-form-actions--auth">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        {success ? <div className="em-auth-success">{success}</div> : null}
        {error ? <div className="em-auth-error">{error}</div> : null}
      </div>
    </div>
  );
}
