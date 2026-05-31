import { useState } from "react";
import HomePage from "./pages/HomePage";
import TimetablePage from "./pages/TimetablePage";
import SubstitutionsPage from "./pages/SubstitutionsPage";
import GeneralSettingsPage from "./pages/GeneralSettingsPage";
import LoginPage from "./pages/LoginPage";
import UserAvatar from "./components/UserAvatar";
import ProfileSettingsModal from "./components/ProfileSettingsModal";
import { getCurrentUser, logout } from "./lib/authStorage";
import { onUserSessionStarted } from "./lib/userDataStorage";
import "./App.css";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "timetable", label: "Timetable" },
  { id: "substitutions", label: "Substitution" },
  { id: "settings", label: "General Settings" },
];

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

  if (!user) {
    return (
      <div className="app">
        <header className="top-bar">
          <h1 className="top-bar-title">Campus Schedule Planner</h1>
        </header>
        <main className="app-main">
          <LoginPage onAuthed={setUser} />
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

  const displayName = user.profile?.name?.trim() || user.email;

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <HomePage />;
      case "timetable":
        return <TimetablePage />;
      case "substitutions":
        return <SubstitutionsPage />;
      case "settings":
        return <GeneralSettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app">
      <header className="top-bar">
        <h1 className="top-bar-title">Campus Schedule Planner</h1>
        <div className="top-bar-user">
          <button
            type="button"
            className="top-bar-user__profile"
            onClick={() => setProfileOpen(true)}
            title="Profile settings"
            aria-label={`Profile settings for ${displayName}`}
          >
            <UserAvatar displayName={displayName} email={user.email} size={36} />
            <span className="top-bar-user__name">Hi, {displayName}</span>
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
        {NAV_ITEMS.map((item) => (
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

      <main className="app-main" key={user.email}>
        {renderPage()}
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
