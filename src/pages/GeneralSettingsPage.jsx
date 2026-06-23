import { useState } from "react";
import "../App.css";
import SchoolSettingsPage from "./settings/SchoolSettingsPage";
import ClassesSettingsPage from "./settings/ClassesSettingsPage";
import SubjectsSettingsPage from "./settings/SubjectsSettingsPage";
import TeachersSettingsPage from "./settings/TeachersSettingsPage";

export default function GeneralSettingsPage() {
  const [activeId, setActiveId] = useState("school");
  // Bumped whenever class lessons are saved so TeachersSettingsPage remounts
  // and reloads the updated class-teacher assignments.
  const [teachersRevision, setTeachersRevision] = useState(0);

  const onClassLessonsSaved = () => setTeachersRevision((v) => v + 1);

  return (
    <div className="settings-layout">
      <aside className="settings-left-panel">
        {[
          { id: "school",   label: "School settings" },
          { id: "classes",  label: "Classes" },
          { id: "subjects", label: "Subjects" },
          { id: "teachers", label: "Teachers" },
        ].map((item) => (
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
        {activeId === "school"   && <SchoolSettingsPage />}
        {activeId === "classes"  && <ClassesSettingsPage onClassLessonsSaved={onClassLessonsSaved} />}
        {activeId === "subjects" && <SubjectsSettingsPage />}
        {activeId === "teachers" && <TeachersSettingsPage key={teachersRevision} />}
      </main>
    </div>
  );
}
