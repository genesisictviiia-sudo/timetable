import { useState } from "react";
import ForgotPasswordForm from "../components/ForgotPasswordForm";
import { login, initiateSignup, verifySignupOtp } from "../lib/authStorage";
import { PASSWORD_RESET_FROM_EMAIL } from "../lib/resetEmailConfig";

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <label className="auth-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <div className="pw-field-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          className="field-input"
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          minLength={6}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="pw-show-btn"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </label>
  );
}

export default function LoginPage({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup | otp | forgot
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [fallbackOtp, setFallbackOtp] = useState("");
  const [emailError, setEmailError] = useState(""); // shown when email not configured
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setForgotDone(false);
  };

  // Login submit
  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login({ userId, password });
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Signup step 1: send OTP
  const submitSignup = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await initiateSignup({ userId, email, password, confirmPassword });
      setPendingEmail(result.email);
      setFallbackOtp(result.emailDelivered ? "" : result.otp);
      setEmailError(result.emailDelivered ? "" : (result.emailError || ""));
      setOtp("");
      switchMode("otp");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Signup step 2: verify OTP
  const submitOtp = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await verifySignupOtp({ email: pendingEmail, otp });
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP by re-running signup with same details
  const resendOtp = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await initiateSignup({ userId, email: pendingEmail, password, confirmPassword });
      setFallbackOtp(result.emailDelivered ? "" : result.otp);
      setEmailError(result.emailDelivered ? "" : (result.emailError || ""));
      setOtp("");
      setError("");
    } catch (err) {
      setError(err.message || "Could not resend OTP.");
    } finally {
      setBusy(false);
    }
  };

  const importDemoData = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/seed.json");
      if (!res.ok) throw new Error("seed.json not found.");
      const seed = await res.json();
      const DEMO_USER = "demo";
      const DEMO_EMAIL = "demo@example.com";

      try {
        const users = JSON.parse(localStorage.getItem("subst.auth.users") || "{}");
        delete users[DEMO_USER];
        delete users[DEMO_EMAIL];
        localStorage.setItem("subst.auth.users", JSON.stringify(users));
        const idx = JSON.parse(localStorage.getItem("subst.auth.emailIndex") || "{}");
        delete idx[DEMO_EMAIL];
        localStorage.setItem("subst.auth.emailIndex", JSON.stringify(idx));
      } catch { /* ignore */ }

      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}::demo1234`));
      const hash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      const users = JSON.parse(localStorage.getItem("subst.auth.users") || "{}");
      users[DEMO_USER] = { salt, hash, email: DEMO_EMAIL, profile: { name: "Demo User", createdAt: new Date().toISOString() } };
      localStorage.setItem("subst.auth.users", JSON.stringify(users));

      const idx = JSON.parse(localStorage.getItem("subst.auth.emailIndex") || "{}");
      idx[DEMO_EMAIL] = DEMO_USER;
      localStorage.setItem("subst.auth.emailIndex", JSON.stringify(idx));

      localStorage.setItem("subst.auth.session", JSON.stringify({ userId: DEMO_USER, email: DEMO_EMAIL, startedAt: Date.now() }));

      const scope = (k) => `subst.userData.${DEMO_EMAIL}.${k}`;
      localStorage.setItem(scope("school"), JSON.stringify(seed.school));
      localStorage.setItem(scope("classes"), JSON.stringify({ classes: seed.classes }));
      localStorage.setItem(scope("subjects"), JSON.stringify(seed.subjects));
      localStorage.setItem(scope("teachers"), JSON.stringify(seed.teachers));
      localStorage.setItem(scope("classLessons"), JSON.stringify(seed.classLessons));

      onAuthed({ email: DEMO_EMAIL, userId: DEMO_USER, profile: { name: "Demo User" } });
    } catch (err) {
      setError(err.message || "Could not import demo data.");
    } finally {
      setBusy(false);
    }
  };

  // ── OTP verification screen ──────────────────────────────────────────────
  if (mode === "otp") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h2 className="card-title">Verify your email</h2>
          <p className="card-desc">
            We sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it below to
            activate your account.
          </p>

          {fallbackOtp && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#fef9c3", border: "1px solid #fde047", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
              <p style={{ margin: 0 }}>
                ⚠️ Email could not be sent. Your OTP is: <strong style={{ fontSize: "1.1rem", letterSpacing: "0.1em" }}>{fallbackOtp}</strong>
              </p>
              {emailError && (
                <p style={{ margin: "0.4rem 0 0", color: "#92400e", fontFamily: "monospace", fontSize: "0.78rem" }}>
                  EmailJS error: {emailError}
                </p>
              )}
            </div>
          )}

          <form onSubmit={submitOtp} className="auth-form" style={{ marginTop: "0.75rem" }}>
            <label className="auth-field">
              <span className="field-label">Verification code</span>
              <input
                type="text"
                className="field-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="6-digit code"
                autoFocus
              />
            </label>

            {error && <p className="auth-error">{error}</p>}

            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Verifying…" : "Verify & create account"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resendOtp} disabled={busy}>
                Resend code
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: "4px" }}>
              <button type="button" className="btn btn-ghost" onClick={() => switchMode("signup")} disabled={busy}>
                Back
              </button>
            </div>
          </form>

          <p className="auth-footnote">
            The code was sent from {PASSWORD_RESET_FROM_EMAIL}. Check your spam folder if you
            don't see it. The code expires in 30 minutes.
          </p>
        </div>
      </div>
    );
  }

  // ── Forgot password screen ───────────────────────────────────────────────
  if (mode === "forgot") {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h2 className="card-title">Reset password</h2>
          {forgotDone ? (
            <>
              <p className="auth-success">Password reset. Sign in with your new password.</p>
              <div className="btn-row" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn btn-primary" onClick={() => switchMode("login")}>
                  Back to sign in
                </button>
              </div>
            </>
          ) : (
            <ForgotPasswordForm
              onBack={() => switchMode("login")}
              onSuccess={() => setForgotDone(true)}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Login / Signup screens ───────────────────────────────────────────────
  const isSignup = mode === "signup";

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h2 className="card-title">{isSignup ? "Create account" : "Sign in"}</h2>
        <p className="card-desc">
          {isSignup
            ? "Create your Smart Scheduler account."
            : "Sign in to access your timetable workspace."}
        </p>

        <form onSubmit={isSignup ? submitSignup : submitLogin} className="auth-form">
          <label className="auth-field">
            <span className="field-label">User ID</span>
            <input
              type="text"
              className="field-input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="username"
              required
              placeholder={isSignup ? "e.g. john.doe  (letters, numbers, . _ -)" : "Your User ID"}
            />
          </label>

          {isSignup && (
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
              <span className="field-hint">A verification code will be sent to this address.</span>
            </label>
          )}

          <PasswordField
            id="auth-password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder={isSignup ? "At least 6 characters" : "Your password"}
          />

          {isSignup && (
            <PasswordField
              id="auth-confirm-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repeat password"
            />
          )}

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
              {busy
                ? "Please wait…"
                : isSignup
                ? "Send verification code"
                : "Sign in"}
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
            <button type="button" className="btn btn-ghost" onClick={importDemoData} disabled={busy}
              title="Loads sample data into a demo account.">
              Import demo data
            </button>
          </div>
        )}

        {isSignup && (
          <p className="auth-footnote">
            One account per email. User ID: 3–30 characters, letters/numbers/._-
          </p>
        )}
      </div>
    </div>
  );
}
