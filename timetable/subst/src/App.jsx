import { useState } from "react";
import HomePage from "./pages/HomePage";
import TimetablePage from "./pages/TimetablePage";
import SubstitutionsPage from "./pages/SubstitutionsPage";
import GeneralSettingsPage from "./pages/GeneralSettingsPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import { getCurrentUser, logout } from "./lib/authStorage";
import "./App.css";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "timetable", label: "Time Table" },
  { id: "substitutions", label: "Substitutions" },
  { id: "settings", label: "General Setting" },
  { id: "profile", label: "Profile" },
];

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState(() => getCurrentUser());

  if (!user) {
    return (
      <div className="app">
        <header className="top-bar">
          <h1 className="top-bar-title">Smart Substitution Planner</h1>
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
      case "profile":
        return (
          <ProfilePage
            user={user}
            onUserChange={setUser}
            onLogout={handleLogout}
          />
        );
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app">
      <header className="top-bar">
        <h1 className="top-bar-title">Smart Substitution Planner</h1>
        <div className="top-bar-user">
          <span className="top-bar-user__name">Hi, {displayName}</span>
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

      <main className="app-main">{renderPage()}</main>
    </div>
  );
}

export default App;
