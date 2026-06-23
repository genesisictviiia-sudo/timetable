import { useEffect, useRef, useState } from "react";
import { downloadCsvFile, parseCsv, validateCsvFormat } from "../lib/csvSample";
import { loadClassesList, loadSubjects, loadTeachersFull } from "../lib/settingsStorage";
import { moveRowById } from "../lib/reorderRows";
import RowMoveButtons from "./RowMoveButtons";

// First 4 columns are required; 5th is optional.
// Additional teachers column accepts multiple names separated by commas.
// Each named teacher will also get this lesson added to their lesson list.
const LESSONS_CSV_REQUIRED_HEADERS = [
  "Subject",
  "Classes (comma-separated)",
  "Periods per week",
  "Class teacher (yes/no)",
];
const LESSONS_CSV_HEADERS = [
  ...LESSONS_CSV_REQUIRED_HEADERS,
  "Additional teachers (optional - separate multiple names with commas)",
];
const LESSONS_CSV_SAMPLE = [
  "Mathematics",
  "Grade 10 A, Grade 10 B",
  "5",
  "yes",
  "Teacher B, Teacher C",
];
const LESSONS_CSV_SAMPLE2 = [
  "Science",
  "Grade 10 A",
  "4",
  "no",
  "Teacher D",
];
const LESSONS_CSV_SAMPLE3 = [
  "Physical Education",
  "Grade 10 A, Grade 10 B, Grade 10 C",
  "2",
  "no",
  "",
];

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function newLessonRow() {
  return {
    id: newId(),
    subject: "",
    classLabels: "",        // comma-separated, e.g. "10A, 10B"
    periodsPerWeek: "",
    isClassTeacher: false,
    additionalTeachers: "", // comma-separated teacher names
    selected: false,
  };
}

/** Split a comma-separated string into a trimmed, non-empty array. */
function splitComma(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve a user-entered class title/label back to the stored label. */
function resolveClassLabel(entered, classItems) {
  const v = String(entered || "").trim();
  const found = classItems.find(
    (c) => c.display === v || c.label === v
  );
  return found ? found.label : v;
}

export default function TeacherLessonsModal({ open, teacher, onClose, onSave }) {
  const [rows, setRows] = useState([newLessonRow()]);
  const [subjects, setSubjects] = useState([]);
  // classItems: [{label: "10A", display: "Grade 10 Section A"}]
  const [classItems, setClassItems] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const csvInputRef = useRef(null);

  useEffect(() => {
    if (!open || !teacher) return;
    setSubjects(loadSubjects().map((s) => s.name));
    const loaded = loadClassesList().map((c) => ({
      label: c.label,
      display: c.title || c.label,
    }));
    setClassItems(loaded);
    setAllTeachers(loadTeachersFull().map((t) => t.name).filter((n) => n !== teacher.name));

    const saved = teacher.lessons || [];
    if (saved.length) {
      // Enforce: only the first row flagged as class teacher per class keeps the flag.
      const ctClassSeen = new Set();
      setRows(
        saved.map((l, i) => {
          const classLabel = String(l.classLabel || "").trim();
          let isClassTeacher = Boolean(l.isClassTeacher);
          if (isClassTeacher) {
            if (ctClassSeen.has(classLabel)) {
              isClassTeacher = false;
            } else {
              ctClassSeen.add(classLabel);
            }
          }
          return {
            id: l.id || `tl-${i}`,
            subject: l.subject ?? "",
            classLabels: l.classLabels ?? l.classLabel ?? "",
            periodsPerWeek: l.periodsPerWeek ?? "",
            isClassTeacher,
            additionalTeachers: Array.isArray(l.additionalTeachers)
              ? l.additionalTeachers.join(", ")
              : (l.additionalTeachers ?? ""),
            selected: false,
          };
        })
      );
    } else {
      setRows([newLessonRow()]);
    }
  }, [open, teacher]);

  if (!open || !teacher) return null;

  const updateRow = (id, field, value) => {
    setRows((prev) => {
      if (field !== "isClassTeacher" || !value) {
        return prev.map((r) => (r.id === id ? { ...r, [field]: value } : r));
      }
      // Checking isClassTeacher: uncheck only rows that share at least one class
      // with the target row. Rows for unrelated classes keep their own CT flag.
      const target = prev.find((r) => r.id === id);
      const targetClasses = new Set(splitComma(target?.classLabels || ""));
      return prev.map((r) => {
        if (r.id === id) return { ...r, isClassTeacher: true };
        if (r.isClassTeacher && targetClasses.size > 0) {
          const sharesClass = splitComma(r.classLabels || "").some((c) => targetClasses.has(c));
          if (sharesClass) return { ...r, isClassTeacher: false };
        }
        return r;
      });
    });
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
    if (!n) { alert("Select lesson rows to delete."); return; }
    setRows((prev) => {
      const next = prev.filter((r) => !r.selected);
      return next.length ? next : [newLessonRow()];
    });
  };

  const resetRows = () => {
    if (!window.confirm("Clear all lesson rows for this teacher?")) return;
    setRows([newLessonRow()]);
  };

  const downloadSample = () => {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = LESSONS_CSV_HEADERS.map(escape).join(",");
    const row1 = LESSONS_CSV_SAMPLE.map(escape).join(",");
    const row2 = LESSONS_CSV_SAMPLE2.map(escape).join(",");
    const row3 = LESSONS_CSV_SAMPLE3.map(escape).join(",");
    const csv = "﻿" + [header, row1, row2, row3].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lessons-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCsv(String(ev.target.result ?? ""));
      // Accept either 4 required columns or 5 (with optional additional teachers)
      const check = validateCsvFormat(parsed, LESSONS_CSV_REQUIRED_HEADERS) ||
        validateCsvFormat(parsed, LESSONS_CSV_HEADERS);
      const result = validateCsvFormat(parsed, LESSONS_CSV_REQUIRED_HEADERS).ok
        ? validateCsvFormat(parsed, LESSONS_CSV_REQUIRED_HEADERS)
        : validateCsvFormat(parsed, LESSONS_CSV_HEADERS);
      if (!result.ok) { alert(result.message); return; }
      const { dataRows } = result;
      const imported = dataRows.map((cells) => ({
        ...newLessonRow(),
        subject: (cells[0] ?? "").trim(),
        classLabels: (cells[1] ?? "").trim(),
        periodsPerWeek: (cells[2] ?? "").trim(),
        isClassTeacher: (cells[3] ?? "").trim().toLowerCase() === "yes",
        additionalTeachers: (cells[4] ?? "").trim(),
      }));
      if (imported.some((r) => !r.subject || !r.classLabels)) {
        alert("Each row must have a Subject and at least one Class.");
        return;
      }
      setRows((prev) => {
        const isEmpty = prev.length === 1 && !prev[0].subject && !prev[0].classLabels;
        return isEmpty ? imported : [...prev, ...imported];
      });
      alert(`Added ${imported.length} lesson row(s) from CSV.`);
    };
    reader.readAsText(file);
  };

  const handleSave = () => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.subject) { alert(`Select subject for row ${i + 1}.`); return; }
      if (!r.classLabels.trim()) { alert(`Enter at least one class for row ${i + 1}.`); return; }
      const n = Number(r.periodsPerWeek);
      if (!r.periodsPerWeek || Number.isNaN(n) || n < 1) {
        alert(`Enter valid periods per week for row ${i + 1}.`);
        return;
      }
    }

    // Expand each row: one lesson per class label, with full dedup.
    const primaryLessons = [];
    const primarySeen = new Set(); // "subject::classLabel"
    const ctClassSeen = new Set(); // classLabel — ensures only one isClassTeacher per class

    // collaboratorMap: { teacherName -> lessons[] }
    // Each teacher's list is also deduplicated by "subject::classLabel".
    const collaboratorMap = {};
    const collaboratorSeen = {}; // { teacherName -> Set<"subject::classLabel"> }

    for (const r of rows) {
      // Resolve each entered class title → stored label
      const classList = splitComma(r.classLabels).map((v) => resolveClassLabel(v, classItems));
      const extraTeachers = splitComma(r.additionalTeachers);
      const ppw = Number(r.periodsPerWeek);

      for (const classLabel of classList) {
        // ── Primary teacher: skip if already added ──────────────────────────
        const primaryKey = `${r.subject}::${classLabel}`;
        if (!primarySeen.has(primaryKey)) {
          primarySeen.add(primaryKey);
          // Only the first row claiming isClassTeacher for a given class keeps the flag.
          const isClassTeacher = r.isClassTeacher && !ctClassSeen.has(classLabel);
          if (isClassTeacher) ctClassSeen.add(classLabel);
          primaryLessons.push({
            id: newId(),
            subject: r.subject,
            classLabel,
            classLabels: classList.join(", "),
            periodsPerWeek: ppw,
            isClassTeacher,
            additionalTeachers: extraTeachers,
          });
        }

        // ── Collaborating teachers: skip if already added for that teacher ──
        for (const tName of extraTeachers) {
          if (!collaboratorMap[tName]) {
            collaboratorMap[tName] = [];
            collaboratorSeen[tName] = new Set();
          }
          const collabKey = `${r.subject}::${classLabel}`;
          if (!collaboratorSeen[tName].has(collabKey)) {
            collaboratorSeen[tName].add(collabKey);
            collaboratorMap[tName].push({
              id: newId(),
              subject: r.subject,
              classLabel,
              classLabels: classList.join(", "),
              periodsPerWeek: ppw,
              isClassTeacher: false,
              additionalTeachers: [teacher.name, ...extraTeachers.filter((n) => n !== tName)],
            });
          }
        }
      }
    }

    onSave(teacher.id, primaryLessons, collaboratorMap);
    onClose();
  };

  const classListId = `classes-dl-${teacher.id}`;
  const teacherListId = `teachers-dl-${teacher.id}`;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="teacher-lessons-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="teacher-lessons-title" className="modal-title">Lessons</h3>
        <p className="teacher-lessons-teacher-name">{teacher.name}</p>

        <div className="settings-action-row settings-action-row--tight" style={{ marginBottom: "0.5rem" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={downloadSample}>
            ↓ Download Sample CSV
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => csvInputRef.current?.click()}>
            ↑ Upload CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvUpload} />
        </div>

        {/* Datalists for autocomplete */}
        <datalist id={classListId}>
          {classItems.map((c) => <option key={c.label} value={c.display} />)}
        </datalist>
        <datalist id={teacherListId}>
          {allTeachers.map((t) => <option key={t} value={t} />)}
        </datalist>

        <div className="period-table-wrap settings-form-compact">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "2.2rem" }} aria-label="Select" />
                <th style={{ width: "2.2rem" }}>S.no</th>
                <th style={{ width: "2.6rem" }} aria-label="Reorder" />
                <th>Subject</th>
                <th>Classes</th>
                <th>Periods / week</th>
                <th>Class teacher</th>
                <th>Additional teachers <span style={{fontWeight:400,fontSize:"0.8em"}}>(optional)</span></th>
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
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.classLabels}
                      list={classListId}
                      placeholder="e.g. 10A, 10B"
                      onChange={(e) => updateRow(row.id, "classLabels", e.target.value)}
                      style={{ minWidth: "8rem" }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={row.periodsPerWeek}
                      onChange={(e) => updateRow(row.id, "periodsPerWeek", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.isClassTeacher}
                      onChange={(e) => updateRow(row.id, "isClassTeacher", e.target.checked)}
                      aria-label="Class teacher for this class"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.additionalTeachers}
                      list={teacherListId}
                      placeholder="e.g. Teacher B, Teacher C"
                      onChange={(e) => updateRow(row.id, "additionalTeachers", e.target.value)}
                      style={{ minWidth: "10rem" }}
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
          <button type="button" className="btn btn-ghost" onClick={deleteSelected}>Delete selected</button>
          <button type="button" className="btn btn-ghost" onClick={resetRows}>Reset</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
