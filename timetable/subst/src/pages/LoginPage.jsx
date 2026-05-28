import { useState } from "react";
import { login, signup } from "../lib/authStorage";

export default function LoginPage({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await login({ email, password })
          : await signup({ email, password, name });
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h2 className="card-title">{isSignup ? "Create account" : "Sign in"}</h2>
        <p className="card-desc">
          {isSignup
            ? "Set up a local account to save your timetable preferences."
            : "Sign in to access your timetable workspace."}
        </p>

        <form onSubmit={submit} className="auth-form">
          {isSignup && (
            <label className="auth-field">
              <span className="field-label">Name</span>
              <input
                type="text"
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
              />
            </label>
          )}

          <label className="auth-field">
            <span className="field-label">Email</span>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>

          <label className="auth-field">
            <span className="field-label">Password</span>
            <input
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={6}
              placeholder={isSignup ? "At least 6 characters" : "Your password"}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
              }}
              disabled={busy}
            >
              {isSignup ? "I already have an account" : "Create a new account"}
            </button>
          </div>
        </form>

        <p className="auth-footnote">
          Accounts are stored locally in your browser. Clearing site data signs you out
          and removes all accounts.
        </p>
      </div>
    </div>
  );
}
