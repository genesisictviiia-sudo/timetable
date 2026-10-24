import { useState, useEffect, useCallback } from "react";
import HomePage from "./pages/HomePage";
import TimetablePage from "./pages/TimetablePage";
import InvigilationsPage from "./pages/InvigilationsPage";
import SubstitutionsPage from "./pages/SubstitutionsPage";
import GeneralSettingsPage from "./pages/GeneralSettingsPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import Logo from "./components/Logo";
import UserAvatar from "./components/UserAvatar";
import ProfileSettingsModal from "./components/ProfileSettingsModal";
import { getCurrentUser, logout } from "./lib/authStorage";
import { flushPendingSyncs, getSyncError, hydrateFromApi, onUserSessionStarted, subscribeSyncStatus } from "./lib/userDataStorage";
import { sendSubscriptionEnquiry } from "./lib/sendResetEmail";
import "./App.css";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "timetable", label: "Timetable" },
  { id: "invigilations", label: "Invigilation" },
  { id: "substitutions", label: "Substitution" },
  { id: "settings", label: "General Settings" },
];

const ADMIN_NAV = { id: "admin", label: "Admin" };

function SubscriptionModal({ onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setErr("All fields are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const result = await sendSubscriptionEnquiry({ name: name.trim(), email: email.trim(), mobile: mobile.trim() });
      if (result?.delivered) {
        setDone(true);
      } else if (result?.reason === "not_configured") {
        setErr("Email service is not configured. Please contact admin.campusscheduler@gmail.com directly.");
      } else {
        setErr(`Failed to send enquiry${result?.detail ? ` — ${result.detail}` : ""}. Please try again.`);
      }
    } catch (e) {
      setErr(`Failed to send enquiry${e?.message ? ` — ${e.message}` : ""}. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ width: "min(460px,95vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 className="modal-title">Upgrade to Prime</h3>
          <button type="button" className="btn btn-ghost btn--sm" onClick={onClose}>Close</button>
        </div>
        {done ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--color-primary)", marginBottom: "0.5rem" }}>
              Thank you!
            </p>
            <p style={{ color: "var(--text-muted)" }}>
              Your enquiry has been sent. Our team will contact you shortly.
            </p>
            <button type="button" className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <p className="card-desc" style={{ marginBottom: "1.25rem" }}>
              Fill in your details and we'll get in touch to remove the watermark from your printouts.
            </p>
            <form onSubmit={submit} className="auth-form">
              <label className="auth-field">
                <span className="field-label">Full Name</span>
                <input type="text" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </label>
              <label className="auth-field">
                <span className="field-label">Email</span>
                <input type="email" className="field-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="auth-field">
                <span className="field-label">Mobile Number</span>
                <input type="tel" className="field-input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 XXXXX XXXXX" />
              </label>
              {err && <p className="auth-error">{err}</p>}
              <div className="btn-row">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Sending…" : "Submit Enquiry"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function PrintGuard({ userType }) {
  const [showAlert, setShowAlert] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleBeforePrint = useCallback(() => {
    if (userType !== "prime") {
      // watermark is shown via CSS; also flag alert to show after print dialog closes
    }
  }, [userType]);

  useEffect(() => {
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, [handleBeforePrint]);

  // Provide a global triggerPrint so pages can call it for the alert flow
  useEffect(() => {
    window.__smartSchedulerPrint = () => {
      if (userType === "prime" || userType === "pro") {
        window.print();
      } else {
        setShowAlert(true);
      }
    };
    return () => { delete window.__smartSchedulerPrint; };
  }, [userType]);

  if (showForm) return <SubscriptionModal onClose={() => setShowForm(false)} />;

  if (showAlert) {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div className="modal-card" style={{ width: "min(420px,95vw)" }}>
          <h3 className="modal-title">Watermark Notice</h3>
          <p className="card-desc" style={{ margin: "0.75rem 0 1.25rem" }}>
            Your printout will include a <strong>smartscheduler.in</strong> watermark.
            Take a Prime subscription to remove it.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { setShowAlert(false); setShowForm(true); }}
            >
              Yes, subscribe
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setShowAlert(false); window.print(); }}
            >
              Print anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function SyncStatusBanner() {
  const [error, setError] = useState(() => getSyncError());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => subscribeSyncStatus(setError), []);

  if (!error) return null;

  const retry = () => {
    setRetrying(true);
    flushPendingSyncs();
    setTimeout(() => setRetrying(false), 1500);
  };

  return (
    <div className="sync-error-banner" role="alert">
      <span>⚠ {error}</span>
      <button type="button" className="btn btn-ghost btn--sm" onClick={retry} disabled={retrying}>
        {retrying ? "Retrying…" : "Retry now"}
      </button>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState(() => {
    const current = getCurrentUser();
    if (current?.email) {
      onUserSessionStarted(current.email, { isNewAccount: false });
    }
    return current;
  });
  const [profileOpen, setProfileOpen] = useState(false);
  // Pull the latest data from the server on every app load (not only at
  // login) so changes made on another system show up here after a refresh.
  const [hydrated, setHydrated] = useState(() => !getCurrentUser());

  useEffect(() => {
    let cancelled = false;
    if (getCurrentUser()?.email) {
      hydrateFromApi().finally(() => {
        if (!cancelled) setHydrated(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("signin")) {
      window.location.replace("/landing/");
      return null;
    }
    return (
      <div className="app">
        <header className="top-bar">
          <div className="top-bar-brand">
            <Logo />
            <h1 className="top-bar-title">Smart Scheduler</h1>
          </div>
        </header>
        <main className="app-main">
          <LoginPage onAuthed={(u) => {
            // Remove ?signin param from URL after login
            window.history.replaceState({}, "", "/");
            setUser(u);
          }} />
        </main>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setUser(null);
    setActiveTab("home");
    setProfileOpen(false);
  };

  const displayName = user.profile?.name?.trim() || user.userId || user.email;
  const userType = user.userType || "free";
  const isAdmin = user.userId === "admin";
  const isPaid = userType === "prime" || userType === "pro";
  const planLabel = userType === "prime" ? "Prime" : userType === "pro" ? "Pro" : "Free";

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <HomePage />;
      case "timetable":
        return <TimetablePage />;
      case "invigilations":
        return <InvigilationsPage />;
      case "substitutions":
        return <SubstitutionsPage />;
      case "settings":
        return <GeneralSettingsPage />;
      case "admin":
        return <AdminPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className={`app${isPaid ? "" : " app--free"}`}>
      <PrintGuard userType={userType} />
      <SyncStatusBanner />

      <header className="top-bar">
        <div className="top-bar-brand">
          <Logo />
          <h1 className="top-bar-title">Smart Scheduler</h1>
        </div>
        <div className="top-bar-user">
          <button
            type="button"
            className="top-bar-user__profile"
            onClick={() => setProfileOpen(true)}
            title="Profile settings"
            aria-label={`Profile settings for ${displayName}`}
          >
            <UserAvatar displayName={displayName} email={user.email} size={36} />
            <span className="top-bar-user__name">
              Hi, {displayName}
              <span className={`plan-badge plan-badge--${userType === "prime" ? "prime" : userType === "pro" ? "pro" : "free"}`}>
                {planLabel}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="top-bar-user__btn"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="menu-bar" aria-label="Main navigation">
        {[...NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV] : [])].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`menu-item${activeTab === item.id ? " menu-item--active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="app-main" key={`${user.email}-${hydrated}`}>
        {hydrated ? (
          renderPage()
        ) : (
          <section className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <div className="gen-busy-spinner" style={{ margin: "0 auto 0.75rem" }} />
            <p className="card-desc">Syncing your latest data…</p>
          </section>
        )}
      </main>

      <ProfileSettingsModal
        open={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onUserChange={setUser}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
