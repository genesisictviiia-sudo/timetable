import { useEffect, useState } from "react";
import { loadClassesList, loadSubjects } from "../lib/settingsStorage";
import { moveRowById } from "../lib/reorderRows";
import RowMoveButtons from "./RowMoveButtons";

function newLessonRow() {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    subject: "",
    classLabel: "",
    periodsPerWeek: "",
    isClassTeacher: false,
    selected: false,
  };
}

export default function TeacherLessonsModal({ open, teacher, onClose, onSave }) {
  const [rows, setRows] = useState([newLessonRow()]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  useEffect(() => {
    if (!open || !teacher) return;
    setSubjects(loadSubjects().map((s) => s.name));
    setClasses(loadClassesList().map((c) => c.label));
    const saved = teacher.lessons || [];
    if (saved.length) {
      setRows(
        saved.map((l, i) => ({
          id: l.id || `tl-${i}`,
          subject: l.subject ?? "",
          classLabel: l.classLabel ?? "",
          periodsPerWeek: l.periodsPerWeek ?? "",
          isClassTeacher: Boolean(l.isClassTeacher),
          selected: false,
        }))
      );
    } else {
      setRows([newLessonRow()]);
    }
  }, [open, teacher]);

  if (!open || !teacher) return null;

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        if (field === "isClassTeacher" && value === true) {
          return { ...r, isClassTeacher: false };
        }
        return r;
      })
    );
  };

  const toggleSelected = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const addAfter = (afterId) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === afterId);
      const next = [...prev];
      next.splice(index + 1, 0, newLessonRow());
      return next;
    });
  };

  const moveRow = (id, direction) => {
    setRows((prev) => moveRowById(prev, id, direction));
  };

  const deleteSelected = () => {
    const n = rows.filter((r) => r.selected).length;
    if (!n) {
      alert("Select lesson rows to delete.");
      return;
    }
    setRows((prev) => {
      const next = prev.filter((r) => !r.selected);
      return next.length ? next : [newLessonRow()];
    });
  };

  const resetRows = () => {
    if (!window.confirm("Clear all lesson rows for this teacher?")) return;
    setRows([newLessonRow()]);
  };

  const handleSave = () => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.subject) {
        alert(`Select subject for row ${i + 1}.`);
        return;
      }
      if (!r.classLabel) {
        alert(`Select class for row ${i + 1}.`);
        return;
      }
      const n = Number(r.periodsPerWeek);
      if (!r.periodsPerWeek || Number.isNaN(n) || n < 1) {
        alert(`Enter valid periods per week for row ${i + 1}.`);
        return;
      }
    }

    const lessons = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      classLabel: r.classLabel,
      periodsPerWeek: Number(r.periodsPerWeek),
      isClassTeacher: r.isClassTeacher,
    }));

    onSave(teacher.id, lessons);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="teacher-lessons-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="teacher-lessons-title" className="modal-title">
          Lessons
        </h3>
        <p className="teacher-lessons-teacher-name">{teacher.name}</p>

        <div className="period-table-wrap settings-form-compact">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "2.2rem" }} aria-label="Select" />
                <th style={{ width: "2.2rem" }}>S.no</th>
                <th style={{ width: "2.6rem" }} aria-label="Reorder" />
                <th>Subject</th>
                <th>Class</th>
                <th>Periods / week</th>
                <th>Class teacher</th>
                <th style={{ width: "2.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" checked={row.selected} onChange={() => toggleSelected(row.id)} />
                  </td>
                  <td>{index + 1}</td>
                  <td>
                    <RowMoveButtons
                      index={index}
                      total={rows.length}
                      onMoveUp={() => moveRow(row.id, "up")}
                      onMoveDown={() => moveRow(row.id, "down")}
                    />
                  </td>
                  <td>
                    <select value={row.subject} onChange={(e) => updateRow(row.id, "subject", e.target.value)}>
                      <option value="">Subject</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={row.classLabel} onChange={(e) => updateRow(row.id, "classLabel", e.target.value)}>
                      <option value="">Class</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={row.periodsPerWeek}
                      onChange={(e) => updateRow(row.id, "periodsPerWeek", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.isClassTeacher}
                      onChange={(e) => updateRow(row.id, "isClassTeacher", e.target.checked)}
                      aria-label="Class teacher for this class"
                    />
                  </td>
                  <td className="classes-actions-cell">
                    <button type="button" className="add-period-btn" onClick={() => addAfter(row.id)} title="Add lesson row">
                      +
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settings-action-row" style={{ marginTop: "12px" }}>
          <button type="button" className="btn btn-ghost" onClick={deleteSelected}>
            Delete selected
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetRows}>
            Reset
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
