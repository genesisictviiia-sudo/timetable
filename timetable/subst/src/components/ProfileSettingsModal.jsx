import { useState } from "react";
import UserAvatar from "./UserAvatar";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { setPasswordForCurrentUser, updateProfile } from "../lib/authStorage";

export default function ProfileSettingsModal({ open, user, onClose, onUserChange, onLogout }) {
  const [name, setName] = useState(user.profile.name || "");
  const [role, setRole] = useState(user.profile.role || "");
  const [school, setSchool] = useState(user.profile.school || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);

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
      setPwErr("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await setPasswordForCurrentUser({ newPassword });
      setPwMsg("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwErr(err.message || "Could not update password.");
    } finally {
      setPwBusy(false);
    }
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
          <p className="profile-forgot-wrap">
            <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>
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
            <ForgotPasswordForm
              initialEmail={user.email}
              showBackLink={false}
              onSuccess={() => setForgotOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
