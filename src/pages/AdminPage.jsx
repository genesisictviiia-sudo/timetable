import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/apiClient";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function EditUserModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [school, setSchool] = useState(user.school_name || "");
  const [isAdmin, setIsAdmin] = useState(!!user.is_admin);
  const [userType, setUserType] = useState(user.user_type || "free");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const updated = await api.patch(
        `/admin/users/${encodeURIComponent(user.email)}`,
        { name: name.trim(), school_name: school.trim(), is_admin: isAdmin, user_type: userType }
      );
      onSaved(updated);
    } catch (error) {
      setErr(error.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ width: "min(480px,95vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 className="modal-title">Edit user</h3>
          <button type="button" className="btn btn-ghost btn--sm" onClick={onClose}>Close</button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          {user.email} · User ID: <strong>{user.user_id || "—"}</strong>
        </p>
        <form onSubmit={save} className="auth-form">
          <label className="auth-field">
            <span className="field-label">Name</span>
            <input type="text" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Display name" />
          </label>
          <label className="auth-field">
            <span className="field-label">School</span>
            <input type="text" className="field-input" value={school} onChange={e => setSchool(e.target.value)} placeholder="School name" />
          </label>
          <label className="auth-field">
            <span className="field-label">User Type</span>
            <select className="field-input" value={userType} onChange={e => setUserType(e.target.value)}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="prime">Prime</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            <span className="field-label" style={{ margin: 0 }}>Admin privileges</span>
          </label>
          {err && <p className="auth-error">{err}</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated) => {
    setUsers(prev => prev.map(u => u.email === updated.email ? { ...u, ...updated } : u));
    setEditUser(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/admin/users/${encodeURIComponent(deleteTarget.email)}`);
      setUsers(prev => prev.filter(u => u.email !== deleteTarget.email));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.message || "Failed to delete user.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email.includes(q) || (u.user_id || "").includes(q) || (u.name || "").toLowerCase().includes(q);
  });

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Admin — User Management</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              className="field-input"
              placeholder="Search by name, email, or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "220px" }}
            />
            <button type="button" className="btn btn-ghost btn--sm" onClick={load}>Refresh</button>
          </div>
        </div>
        <p className="card-desc" style={{ marginTop: "0.4rem" }}>
          {users.length} user{users.length !== 1 ? "s" : ""} total
        </p>
      </div>

      {loading && <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Loading…</p>}
      {error && <p className="auth-error">{error}</p>}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>User Type</th>
                  <th>School</th>
                  <th>Admin</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>No users found.</td></tr>
                )}
                {filtered.map(u => (
                  <tr key={u.email}>
                    <td><code style={{ fontSize: "0.82rem" }}>{u.user_id || "—"}</code></td>
                    <td>{u.name || "—"}</td>
                    <td style={{ fontSize: "0.82rem" }}>{u.email}</td>
                    <td>
                      {u.user_type === "prime" ? (
                        <span className="user-type-badge user-type-badge--prime">Prime</span>
                      ) : u.user_type === "pro" ? (
                        <span className="user-type-badge user-type-badge--pro">Pro</span>
                      ) : (
                        <span className="user-type-badge user-type-badge--free">Free</span>
                      )}
                    </td>
                    <td>{u.school_name || "—"}</td>
                    <td>
                      {u.is_admin
                        ? <span className="admin-badge admin-badge--yes">Yes</span>
                        : <span className="admin-badge">No</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(u.created_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button type="button" className="btn btn-ghost btn--sm" onClick={() => setEditUser(u)}>Edit</button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}
                          onClick={() => setDeleteTarget(u)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(420px,95vw)" }}>
            <h3 className="modal-title">Delete user?</h3>
            <p className="card-desc" style={{ margin: "0.75rem 0 1.25rem" }}>
              This will permanently delete <strong>{deleteTarget.email}</strong> and all their
              timetable data. This cannot be undone.
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "#dc2626" }}
                onClick={confirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
