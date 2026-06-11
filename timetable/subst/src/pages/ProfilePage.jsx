import { useState } from "react";
import { changePassword, updateProfile } from "../lib/authStorage";

export default function ProfilePage({ user, onUserChange, onLogout }) {
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

  const saveProfile = (e) => {
    e.preventDefault();
    setProfileMsg("");
    setProfileErr("");
    try {
      const updated = updateProfile({ name: name.trim(), role: role.trim(), school: school.trim() });
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

  const memberSince = user.profile.createdAt
    ? new Date(user.profile.createdAt).toLocaleDateString()
    : "—";

  return (
    <div className="page-content profile-page">
      <div className="card">
        <div className="card-head card-head--split">
          <div>
            <h2 className="card-title">Profile</h2>
            <p className="card-desc">Manage your account details.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>

        <dl className="profile-meta">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{memberSince}</dd>
          </div>
        </dl>

        <form onSubmit={saveProfile} className="profile-form">
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
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Change password</h3>
        </div>
        <form onSubmit={submitPassword} className="profile-form">
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

          {pwErr && <p className="auth-error">{pwErr}</p>}
          {pwMsg && <p className="auth-success">{pwMsg}</p>}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
