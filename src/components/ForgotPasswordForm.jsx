import { useState } from "react";
import { requestPasswordReset, resetPasswordWithCode } from "../lib/authStorage";
import { PASSWORD_RESET_FROM_EMAIL } from "../lib/resetEmailConfig";

export default function ForgotPasswordForm({
  initialEmail = "",
  onBack,
  onSuccess,
  showBackLink = true,
}) {
  const [resetEmail, setResetEmail] = useState(initialEmail);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [displayCode, setDisplayCode] = useState("");

  const sendResetCode = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setDisplayCode("");
    setBusy(true);
    try {
      const { email, code, emailDelivered, emailError } = await requestPasswordReset(resetEmail);
      setCodeSent(true);
      if (emailDelivered) {
        setMsg(
          `A 6-digit reset code was sent from ${PASSWORD_RESET_FROM_EMAIL} to ${email}. Enter the code and your new password below.`
        );
      } else {
        setDisplayCode(code);
        setMsg(
          emailError
            ? `Email could not be sent (${emailError}). Use the reset code shown below.`
            : `Email is not configured yet. Use the reset code shown below to continue.`
        );
      }
    } catch (error) {
      setErr(error.message || "Could not send reset code.");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithCode({
        email: resetEmail,
        code: resetCode,
        newPassword,
      });
      setMsg("Password reset successfully. You can sign in with your new password.");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (error) {
      setErr(error.message || "Could not reset password.");
    } finally {
      setBusy(false);
    }
  };

  if (!codeSent) {
    return (
      <form onSubmit={sendResetCode} className="auth-form">
        <p className="card-desc">Enter your account email. We will send a reset code to that address.</p>
        <label className="auth-field">
          <span className="field-label">Email</span>
          <input
            type="email"
            className="field-input"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        {err && <p className="auth-error">{err}</p>}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Sending…" : "Send reset code"}
          </button>
          {showBackLink && onBack && (
            <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitReset} className="auth-form">
      {msg && <p className="auth-success">{msg}</p>}
      {displayCode && (
        <p className="profile-reset-demo-code" role="status">
          Your reset code: <strong>{displayCode}</strong>
          <span className="profile-reset-demo-code__hint">
            {" "}
            (Configure EmailJS in .env to email codes from {PASSWORD_RESET_FROM_EMAIL}.)
          </span>
        </p>
      )}
      <label className="auth-field">
        <span className="field-label">Reset code</span>
        <input
          type="text"
          className="field-input"
          value={resetCode}
          onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          placeholder="6-digit code"
        />
      </label>
      <label className="auth-field">
        <span className="field-label">New password</span>
        <input
          type="password"
          className="field-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
          placeholder="At least 6 characters"
        />
      </label>
      <label className="auth-field">
        <span className="field-label">Confirm password</span>
        <input
          type="password"
          className="field-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </label>
      {err && <p className="auth-error">{err}</p>}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Resetting…" : "Reset password"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setCodeSent(false);
            setMsg("");
            setErr("");
            setDisplayCode("");
          }}
          disabled={busy}
        >
          Resend code
        </button>
        {showBackLink && onBack && (
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
