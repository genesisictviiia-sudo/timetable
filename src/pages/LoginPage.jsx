import { useState } from "react";
import ForgotPasswordForm from "../components/ForgotPasswordForm";
import { login, signup } from "../lib/authStorage";

export default function LoginPage({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

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

  const importDemoData = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/seed.json");
      if (!res.ok) throw new Error("seed.json not found — run `node scripts/build-seed.mjs`.");
      const seed = await res.json();
      const DEMO_EMAIL = "demo@example.com";
      const DEMO_PASSWORD = "demo1234";

      try {
        const usersRaw = localStorage.getItem("subst.auth.users");
        if (usersRaw) {
          const users = JSON.parse(usersRaw);
          if (users[DEMO_EMAIL]) {
            delete users[DEMO_EMAIL];
            localStorage.setItem("subst.auth.users", JSON.stringify(users));
          }
        }
      } catch {
        // ignore corrupt users blob
      }

      const user = await signup({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User" });
      const scope = (k) => `subst.userData.${DEMO_EMAIL}.${k}`;
      localStorage.setItem(scope("school"), JSON.stringify(seed.school));
      localStorage.setItem(scope("classes"), JSON.stringify({ classes: seed.classes }));
      localStorage.setItem(scope("subjects"), JSON.stringify(seed.subjects));
      localStorage.setItem(scope("teachers"), JSON.stringify(seed.teachers));
      localStorage.setItem(scope("classLessons"), JSON.stringify(seed.classLessons));

      onAuthed(user);
    } catch (err) {
      setError(err.message || "Could not import demo data.");
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setForgotDone(false);
  };

  if (isForgot) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h2 className="card-title">Reset password</h2>
          {forgotDone ? (
            <>
              <p className="auth-success">Your password was reset. Sign in with your new password.</p>
              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={() => switchMode("login")}>
                  Back to sign in
                </button>
              </div>
            </>
          ) : (
            <ForgotPasswordForm
              initialEmail={email}
              onBack={() => switchMode("login")}
              onSuccess={() => setForgotDone(true)}
            />
          )}
        </div>
      </div>
    );
  }

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

          {!isSignup && (
            <p className="profile-forgot-wrap">
              <button type="button" className="link-btn" onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
            </p>
          )}

          {error && <p className="auth-error">{error}</p>}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => switchMode(isSignup ? "login" : "signup")}
              disabled={busy}
            >
              {isSignup ? "I already have an account" : "Create a new account"}
            </button>
          </div>
        </form>

        {!isSignup && (
          <div className="btn-row" style={{ marginTop: "8px" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={importDemoData}
              disabled={busy}
              title="Loads sample classes, teachers, subjects, and lessons into a demo account."
            >
              Import demo data
            </button>
          </div>
        )}

        <p className="auth-footnote">
          Accounts are stored locally in your browser. Clearing site data signs you out
          and removes all accounts.
        </p>
      </div>
    </div>
  );
}
