import { useState } from "react";
import UserAvatar from "./UserAvatar";
import {
  changePassword,
  requestPasswordReset,
  resetPasswordWithCode,
  updateProfile,
} from "../lib/authStorage";
import { PASSWORD_RESET_FROM_EMAIL } from "../lib/resetEmailConfig";

export default function ProfileSettingsModal({ open, user, onClose, onUserChange, onLogout }) {
  const [name, setName] = useState(user.profile.name || "");
  const [role, setRole] = useState(user.profile.role || "");
  const [school, setSchool] = useState(user.profile.school || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(user.email || "");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  if (!open) return null;

  const displayName = user.profile?.name?.trim() || user.email;
  const memberSince = user.profile.createdAt
    ? new Date(user.profile.createdAt).toLocaleDateString()
    : "—";

  const saveProfile = (e) => {
    e.preventDefault();
    setProfileMsg("");
    setProfileErr("");
    try {
      const updated = updateProfile({
        name: name.trim(),
        role: role.trim(),
        school: school.trim(),
      });
      onUserChange(updated);
      setProfileMsg("Profile saved.");
    } catch (err) {
      setProfileErr(err.message || "Could not save profile.");
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (newPassword !== confirmPassword) {
      setPwErr("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPwMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwErr(err.message || "Could not change password.");
    } finally {
      setPwBusy(false);
    }
  };

  const sendResetCode = async (e) => {
    e.preventDefault();
    setResetMsg("");
    setResetErr("");
    setResetBusy(true);
    try {
      const { email } = await requestPasswordReset(resetEmail);
      setCodeSent(true);
      setResetMsg(
        `A 6-digit reset code was sent from ${PASSWORD_RESET_FROM_EMAIL} to ${email}. Check your inbox and enter the code below.`
      );
    } catch (err) {
      setResetErr(err.message || "Could not send reset code.");
    } finally {
      setResetBusy(false);
    }
  };

  const submitResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg("");
    setResetErr("");
    if (resetNewPassword !== resetConfirmPassword) {
      setResetErr("New passwords do not match.");
      return;
    }
    setResetBusy(true);
    try {
      await resetPasswordWithCode({
        email: resetEmail,
        code: resetCode,
        newPassword: resetNewPassword,
      });
      setResetMsg("Password reset successfully. You can sign in with your new password.");
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setCodeSent(false);
      setForgotOpen(false);
    } catch (err) {
      setResetErr(err.message || "Could not reset password.");
    } finally {
      setResetBusy(false);
    }
  };

  const openForgot = () => {
    setForgotOpen(true);
    setResetEmail(user.email || "");
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetMsg("");
    setResetErr("");
    setCodeSent(false);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Profile settings">
      <div className="modal-card modal-card--wide profile-settings-modal">
        <div className="profile-settings-modal__head">
          <div className="profile-settings-modal__identity">
            <UserAvatar displayName={displayName} email={user.email} size={48} />
            <div>
              <h3 className="modal-title profile-settings-modal__title">{displayName}</h3>
              <p className="profile-settings-modal__email">{user.email}</p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="profile-meta">
          <div>
            <dt>Member since</dt>
            <dd>{memberSince}</dd>
          </div>
        </dl>

        <form onSubmit={saveProfile} className="profile-form">
          <h4 className="profile-section-title">Account details</h4>
          <label className="auth-field">
            <span className="field-label">Name</span>
            <input
              type="text"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <label className="auth-field">
            <span className="field-label">Role</span>
            <input
              type="text"
              className="field-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Vice Principal"
            />
          </label>
          <label className="auth-field">
            <span className="field-label">School</span>
            <input
              type="text"
              className="field-input"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="School name"
            />
          </label>
          {profileErr && <p className="auth-error">{profileErr}</p>}
          {profileMsg && <p className="auth-success">{profileMsg}</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
          </div>
        </form>

        <form onSubmit={submitPassword} className="profile-form profile-form--bordered">
          <h4 className="profile-section-title">Change password</h4>
          <label className="auth-field">
            <span className="field-label">Current password</span>
            <input
              type="password"
              className="field-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
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
            />
          </label>
          <label className="auth-field">
            <span className="field-label">Confirm new password</span>
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
          <p className="profile-forgot-wrap">
            <button type="button" className="link-btn" onClick={openForgot}>
              Forgot password?
            </button>
          </p>
          {pwErr && <p className="auth-error">{pwErr}</p>}
          {pwMsg && <p className="auth-success">{pwMsg}</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>

        <div className="profile-settings-modal__footer">
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>

        {forgotOpen && (
          <div className="profile-reset-panel" role="region" aria-label="Reset password">
            <div className="profile-reset-panel__head">
              <h4 className="profile-section-title">Reset password</h4>
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={() => setForgotOpen(false)}
              >
                Cancel
              </button>
            </div>

            {!codeSent ? (
              <form onSubmit={sendResetCode} className="profile-form">
                <label className="auth-field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    className="field-input"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                {resetErr && <p className="auth-error">{resetErr}</p>}
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary" disabled={resetBusy}>
                    {resetBusy ? "Sending…" : "Send reset code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitResetPassword} className="profile-form">
                {resetMsg && <p className="auth-success">{resetMsg}</p>}
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
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="field-label">Confirm new password</span>
                  <input
                    type="password"
                    className="field-input"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
                {resetErr && <p className="auth-error">{resetErr}</p>}
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary" disabled={resetBusy}>
                    {resetBusy ? "Resetting…" : "Reset password"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setCodeSent(false);
                      setResetMsg("");
                      setResetErr("");
                    }}
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
