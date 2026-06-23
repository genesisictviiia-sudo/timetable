import { useState } from "react";
import "../App.css";
import SchoolSettingsPage from "./settings/SchoolSettingsPage";
import ClassesSettingsPage from "./settings/ClassesSettingsPage";
import SubjectsSettingsPage from "./settings/SubjectsSettingsPage";
import TeachersSettingsPage from "./settings/TeachersSettingsPage";
const MENU_ITEMS = [
  { id: "school", label: "School settings", Component: SchoolSettingsPage },
  { id: "classes", label: "Classes", Component: ClassesSettingsPage },
  { id: "subjects", label: "Subjects", Component: SubjectsSettingsPage },
  { id: "teachers", label: "Teachers", Component: TeachersSettingsPage },
];

export default function GeneralSettingsPage() {
  const [activeId, setActiveId] = useState("school");
  const active = MENU_ITEMS.find((m) => m.id === activeId) ?? MENU_ITEMS[0];
  const Panel = active.Component;

  return (
    <div className="settings-layout">
      <aside className="settings-left-panel">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-menu-item ${activeId === item.id ? "settings-menu-item--active" : ""}`}
            onClick={() => setActiveId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <main className="settings-right-panel">
        <Panel />
      </main>
    </div>
  );
}
