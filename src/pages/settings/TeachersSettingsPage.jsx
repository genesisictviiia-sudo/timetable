import { useEffect, useState } from "react";
import AddTeacherModal from "../../components/AddTeacherModal";
import CsvSampleButtons from "../../components/CsvSampleButtons";
import RowMoveButtons from "../../components/RowMoveButtons";
import TeacherLessonsModal from "../../components/TeacherLessonsModal";
import TeacherTimeOffModal from "../../components/TeacherTimeOffModal";
import {
  downloadCsvFile,
  parseCsv,
  TEACHERS_CSV_HEADERS,
  TEACHERS_CSV_SAMPLE,
  validateCsvFormat,
} from "../../lib/csvSample";
import { moveRowAtIndex } from "../../lib/reorderRows";
import {
  deriveClassTeacherFromLessons,
  loadTeachersFull,
  saveTeachersFull,
  teacherListSummary,
} from "../../lib/settingsStorage";
import "../../App.css";

function newTeacherRecord({ name, phone, email }) {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name,
    phone,
    email,
    shortName: name,
    lessons: [],
    timeOffGrid: null,
    selected: false,
  };
}

export default function TeachersSettingsPage() {
  const [teachers, setTeachers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [showTimeOff, setShowTimeOff] = useState(false);

  useEffect(() => {
    setTeachers(loadTeachersFull().map((t) => ({ ...t, selected: false })));
  }, []);

  const allChecked = teachers.length > 0 && teachers.every((t) => t.selected);
  const someChecked = teachers.some((t) => t.selected);

  const selected = teachers.find((t) => t.id === selectedId) ?? null;
  const hasSelection = Boolean(selected);

  const moveTeacher = (index, direction) => {
    setTeachers((prev) => moveRowAtIndex(prev, index, direction));
  };

  const toggleChecked = (id) => {
    setTeachers((prev) => prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)));
  };

  const toggleSelectAll = () => {
    const next = !allChecked;
    setTeachers((prev) => prev.map((t) => ({ ...t, selected: next })));
  };

  const removeTeachers = (ids) => {
    setTeachers((prev) => {
      const next = prev.filter((t) => !ids.includes(t.id));
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      return next;
    });
  };

  const deleteOne = (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this teacher?")) return;
    removeTeachers([id]);
  };

  const deleteSelected = () => {
    const ids = teachers.filter((t) => t.selected).map((t) => t.id);
    if (!ids.length) {
      alert("Select one or more teachers using the checkboxes, then delete.");
      return;
    }
    if (!window.confirm(`Delete ${ids.length} selected teacher(s)?`)) return;
    removeTeachers(ids);
  };

  const addTeacher = ({ name, phone, email }) => {
    const record = newTeacherRecord({ name, phone, email });
    setTeachers((prev) => [...prev, record]);
    setSelectedId(record.id);
  };

  const updateTeacherLessons = (teacherId, lessons) => {
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === teacherId
          ? { ...t, lessons, classTeacher: deriveClassTeacherFromLessons(lessons) }
          : t
      )
    );
  };

  const saveTimeOffGrid = (teacherId, timeOffGrid) => {
    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, timeOffGrid } : t)));
  };

  const saveAll = () => {
    saveTeachersFull(teachers);
    alert("All teachers and lessons saved.");
  };

  const openTimeOff = () => {
    setShowTimeOff(true);
  };

  const downloadSample = () => {
    downloadCsvFile("teachers-sample.csv", TEACHERS_CSV_HEADERS, TEACHERS_CSV_SAMPLE);
  };

  const uploadSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      const check = validateCsvFormat(parsed, TEACHERS_CSV_HEADERS);
      if (!check.ok) {
        alert(check.message);
        return;
      }
      const imported = check.dataRows.map((cells) =>
        newTeacherRecord({
          name: (cells[0] ?? "").trim(),
          phone: (cells[1] ?? "").trim(),
          email: (cells[2] ?? "").trim(),
        })
      );
      const missing = imported.filter((t) => !t.name);
      if (missing.length) {
        alert("Each row must include a teacher name.");
        return;
      }
      setTeachers((prev) => [...prev, ...imported]);
      alert(`Added ${imported.length} teacher(s) from CSV.`);
    };
    reader.readAsText(file);
  };

  return (
    <section className="card settings-panel-compact">
      <h2 className="card-title">Teachers</h2>

      <CsvSampleButtons onDownload={downloadSample} onUploadFile={uploadSample} />

      <div className="teacher-toolbar">
        <button type="button" className="btn btn-primary btn--sm" onClick={() => setShowAdd(true)}>
          i. Add new
        </button>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          disabled={!hasSelection}
          onClick={() => setShowLessons(true)}
        >
          ii. Lessons
        </button>
        <button type="button" className="btn btn-ghost btn--sm" disabled={!hasSelection} onClick={openTimeOff}>
          iii. Time off
        </button>
      </div>

      <div className="period-table-wrap teacher-list-scroll settings-form-compact">
        <table className="period-table teacher-list-table">
          <thead>
            <tr>
              <th style={{ width: "2.2rem" }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Select all teachers"
                />
              </th>
              <th style={{ width: "2.5rem" }}>S.no</th>
              <th style={{ width: "2.6rem" }} aria-label="Reorder" />
              <th>Name</th>
              <th>Class teacher</th>
              <th>Lessons / week</th>
              <th>Time off</th>
              <th style={{ width: "2.5rem" }} aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {teachers.length === 0 ? (
              <tr>
                <td colSpan={8} className="teacher-list-empty">
                  No teachers yet. Use &quot;Add new&quot; or upload a sample CSV.
                </td>
              </tr>
            ) : (
              teachers.map((t, index) => {
                const summary = teacherListSummary(t);
                const isSelected = t.id === selectedId;
                return (
                  <tr
                    key={t.id}
                    className={isSelected ? "teacher-row--selected" : ""}
                    onClick={() => setSelectedId(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(t.id);
                      }
                    }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(t.selected)}
                        onChange={() => toggleChecked(t.id)}
                        aria-label={`Select ${t.name}`}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <RowMoveButtons
                        index={index}
                        total={teachers.length}
                        stopPropagation
                        onMoveUp={() => moveTeacher(index, "up")}
                        onMoveDown={() => moveTeacher(index, "down")}
                      />
                    </td>
                    <td className="teacher-list-name">{t.name}</td>
                    <td>{summary.classTeacher}</td>
                    <td>{summary.lessonsPerWeek}</td>
                    <td>{summary.timeOff}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="row-delete-btn"
                        onClick={(e) => deleteOne(t.id, e)}
                        title="Delete teacher"
                        aria-label={`Delete ${t.name}`}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="settings-action-row">
        <button type="button" className="btn btn-ghost row-delete-action" onClick={deleteSelected} title="Delete selected">
          <span aria-hidden>🗑</span> Delete selected
        </button>
        <button type="button" className="btn btn-primary" onClick={saveAll}>
          Save
        </button>
      </div>

      <AddTeacherModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addTeacher} />

      <TeacherLessonsModal
        open={showLessons}
        teacher={selected}
        onClose={() => setShowLessons(false)}
        onSave={updateTeacherLessons}
      />

      <TeacherTimeOffModal
        open={showTimeOff}
        teacher={selected}
        onClose={() => setShowTimeOff(false)}
        onSave={saveTimeOffGrid}
      />
    </section>
  );
}
