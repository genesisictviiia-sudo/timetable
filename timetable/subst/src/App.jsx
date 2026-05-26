import { useState } from "react";
import HomePage from "./pages/HomePage";
import TimetablePage from "./pages/TimetablePage";
import SubstitutionsPage from "./pages/SubstitutionsPage";
import GeneralSettingsPage from "./pages/GeneralSettingsPage";
import "./App.css";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "timetable", label: "Time Table" },
  { id: "substitutions", label: "Substitutions" },
  { id: "settings", label: "General Setting" },
];

function App() {
  const [activeTab, setActiveTab] = useState("home");

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
        <h1 className="top-bar-title">Smart Substitution Planner</h1>
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
