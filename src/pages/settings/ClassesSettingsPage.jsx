import { useEffect, useMemo, useState } from "react";
import ClassLessonsModal from "../../components/ClassLessonsModal";
import CsvSampleButtons from "../../components/CsvSampleButtons";
import RowMoveButtons from "../../components/RowMoveButtons";
import {
  CLASSES_CSV_HEADERS,
  CLASSES_CSV_SAMPLE,
  downloadCsvFile,
  parseCsv,
  validateCsvFormat,
} from "../../lib/csvSample";
import { moveRowById } from "../../lib/reorderRows";
import { getClassLessonStats, loadClassesStorageRaw, saveClassesStorageRaw } from "../../lib/settingsStorage";
import "../../App.css";

function newRow() {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    grade: "",
    section: "",
    title: "",
    selected: false,
  };
}

export default function ClassesSettingsPage({ onClassLessonsSaved }) {
  const [rows, setRows] = useState([newRow()]);
  const [lessonsForClassId, setLessonsForClassId] = useState(null);
  const [lessonsRevision, setLessonsRevision] = useState(0);
  const [search, setSearch] = useState("");

  const lessonStatsByClassId = useMemo(() => {
    const stats = {};
    for (const row of rows) {
      stats[row.id] = getClassLessonStats(row.id);
    }
    return stats;
  }, [rows, lessonsRevision]);

  useEffect(() => {
    const parsed = loadClassesStorageRaw();
    if (!parsed) return;
    try {
      let list = [];

      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && Array.isArray(parsed.classes)) {
        list = parsed.classes;
      }

      if (!list.length) return;
      const loaded = list.map((item, i) => ({
        id: item.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `loaded-${i}`),
        grade: item.grade ?? "",
        section: item.section ?? "",
        title: item.title ?? "",
        selected: false,
      }));
      setRows(loaded);
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const toggleSelected = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const q = search.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter(
        (r) =>
          String(r.grade).toLowerCase().includes(q) ||
          String(r.section).toLowerCase().includes(q) ||
          String(r.title).toLowerCase().includes(q)
      )
    : rows;

  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => r.selected);
  const someChecked = visibleRows.some((r) => r.selected);

  const toggleSelectAll = () => {
    const next = !allChecked;
    const visibleIds = new Set(visibleRows.map((r) => r.id));
    setRows((prev) => prev.map((r) => (visibleIds.has(r.id) ? { ...r, selected: next } : r)));
  };

  const moveRow = (id, direction) => {
    setRows((prev) => moveRowById(prev, id, direction));
  };

  const addAfter = (afterId) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === afterId);
      if (index === -1) return [...prev, newRow()];
      const next = [...prev];
      next.splice(index + 1, 0, newRow());
      return next;
    });
  };

  const openLessons = (row) => {
    if (!String(row.grade).trim() || !String(row.section).trim()) {
      alert("Enter grade and section for this class before setting lessons.");
      return;
    }
    setLessonsForClassId(row.id);
  };

  const deleteSelected = () => {
    const selectedCount = rows.filter((r) => r.selected).length;
    if (!selectedCount) {
      alert("Select one or more rows using the checkboxes, then delete.");
      return;
    }
    if (!window.confirm(`Delete ${selectedCount} selected class(es)?`)) return;
    setRows((prev) => {
      const next = prev.filter((r) => !r.selected);
      return next.length ? next : [newRow()];
    });
  };

  const downloadClassesSample = () => {
    downloadCsvFile("classes-sample.csv", CLASSES_CSV_HEADERS, CLASSES_CSV_SAMPLE);
  };

  const uploadClassesSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      const check = validateCsvFormat(rows, CLASSES_CSV_HEADERS);
      if (!check.ok) {
        alert(check.message);
        return;
      }

      const imported = check.dataRows.map((cells) => ({
        ...newRow(),
        grade: cells[0] ?? "",
        section: cells[1] ?? "",
        title: cells[2] ?? "",
      }));

      setRows((prev) => {
        const existing = prev.filter((r) => r.grade.trim() || r.section.trim() || r.title.trim());
        const base = existing.length ? existing : [];
        return [...base, ...imported];
      });
      alert(`Added ${imported.length} class row(s) from CSV.`);
    };
    reader.readAsText(file);
  };

  const saveClasses = () => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!String(r.grade).trim()) {
        alert(`Enter grade for row ${i + 1}.`);
        return;
      }
      if (!String(r.section).trim()) {
        alert(`Enter section for row ${i + 1}.`);
        return;
      }
      if (!String(r.title).trim()) {
        alert(`Enter class title for row ${i + 1}.`);
        return;
      }
    }

    const payload = {
      classes: rows.map((r) => ({
        id: r.id,
        grade: String(r.grade).trim(),
        section: String(r.section).trim(),
        title: String(r.title).trim(),
      })),
    };

    saveClassesStorageRaw(payload);
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
    alert("Class list saved successfully.");
  };

  const lessonsRow = rows.find((r) => r.id === lessonsForClassId);
  const lastRowId = rows[rows.length - 1]?.id;

  return (
    <section className="card settings-panel-compact">
      <h2 className="card-title">Classes</h2>

      <h3 className="settings-subtitle">Class general settings</h3>
      <p className="card-desc" style={{ marginBottom: "0.5rem" }}>
        Enter grade, section, and title for each class. Use Lessons to configure teachers and subjects. Click + on the
        last row to add another class below it.
      </p>
      <CsvSampleButtons onDownload={downloadClassesSample} onUploadFile={uploadClassesSample} />

      <div style={{ marginBottom: "8px" }}>
        <input
          type="search"
          className="field-input search-input"
          placeholder="Search by grade, section or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search classes"
        />
      </div>

      <div className="period-table-wrap classes-table-scroll settings-form-compact">
        <table className="period-table classes-table">
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
                  aria-label="Select all classes"
                />
              </th>
              <th style={{ width: "2.5rem" }}>S.no</th>
              <th style={{ width: "2.6rem" }} aria-label="Reorder" />
              <th>Grade</th>
              <th>Section</th>
              <th>Class title</th>
              <th style={{ width: "7.5rem" }}>Lessons / periods</th>
              <th style={{ width: "8rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="teacher-list-empty">
                  {rows.length === 0
                    ? "No classes yet. Add a row or upload a CSV."
                    : `No classes match "${search}".`}
                </td>
              </tr>
            ) : null}
            {visibleRows.map((row, index) => {
              const { lessonCount, periodsTotal } = lessonStatsByClassId[row.id] ?? {
                lessonCount: 0,
                periodsTotal: 0,
              };
              return (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => toggleSelected(row.id)}
                    aria-label={`Select class row ${row.grade || row.section || row.title || "new"}`}
                  />
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
                  <input
                    type="text"
                    value={row.grade}
                    onChange={(e) => updateRow(row.id, "grade", e.target.value)}
                    placeholder="e.g. 10"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.section}
                    onChange={(e) => updateRow(row.id, "section", e.target.value)}
                    placeholder="e.g. A"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, "title", e.target.value)}
                    placeholder="e.g. Grade 10 — Section A"
                  />
                </td>
                <td className="classes-lessons-meta">
                  <span className="classes-lessons-meta__count">
                    {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
                  </span>
                  <span className="classes-lessons-meta__periods">
                    {periodsTotal} period{periodsTotal === 1 ? "" : "s"}/week
                  </span>
                </td>
                <td className="classes-actions-cell">
                  <button type="button" className="link-btn" onClick={() => openLessons(row)}>
                    Lessons
                  </button>
                  {row.id === lastRowId && (
                    <button
                      type="button"
                      className="add-period-btn"
                      onClick={() => addAfter(row.id)}
                      title="Add class row below"
                    >
                      +
                    </button>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <div className="settings-action-row">
        <button type="button" className="btn btn-ghost" onClick={deleteSelected}>
          Delete selected
        </button>
        <button type="button" className="btn btn-primary" onClick={saveClasses}>
          Save classes
        </button>
      </div>

      <ClassLessonsModal
        open={Boolean(lessonsForClassId)}
        classRow={lessonsRow}
        onClose={() => {
          setLessonsForClassId(null);
          setLessonsRevision((v) => v + 1);
        }}
        onSaved={onClassLessonsSaved}
      />
    </section>
  );
}

export { CLASSES_STORAGE_KEY } from "../../lib/settingsStorage";
