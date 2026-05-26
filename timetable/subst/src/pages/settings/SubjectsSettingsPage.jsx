import { useEffect, useState } from "react";
import CsvSampleButtons from "../../components/CsvSampleButtons";
import RowMoveButtons from "../../components/RowMoveButtons";
import {
  downloadCsvFile,
  parseCsv,
  SUBJECTS_CSV_HEADERS,
  SUBJECTS_CSV_SAMPLE,
  validateCsvFormat,
} from "../../lib/csvSample";
import { moveRowById } from "../../lib/reorderRows";
import { loadSubjects, SUBJECTS_STORAGE_KEY } from "../../lib/settingsStorage";
import "../../App.css";

function newSubject() {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: "",
    shortName: "",
    selected: false,
  };
}

export default function SubjectsSettingsPage() {
  const [rows, setRows] = useState([newSubject()]);

  useEffect(() => {
    const list = loadSubjects();
    if (!list.length) {
      setRows([newSubject()]);
      return;
    }
    setRows(
      list.map((s, i) => ({
        id: `s-${i}-${s.name}`,
        name: s.name,
        shortName: s.shortName,
        selected: false,
      }))
    );
  }, []);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const toggleSelected = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const allChecked = rows.length > 0 && rows.every((r) => r.selected);
  const someChecked = rows.some((r) => r.selected);

  const toggleSelectAll = () => {
    const next = !allChecked;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  };

  const moveRow = (id, direction) => {
    setRows((prev) => moveRowById(prev, id, direction));
  };

  const addAfter = (afterId) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === afterId);
      const next = [...prev];
      next.splice(index === -1 ? next.length : index + 1, 0, newSubject());
      return next;
    });
  };

  const deleteSelected = () => {
    const n = rows.filter((r) => r.selected).length;
    if (!n) {
      alert("Select subject rows to delete.");
      return;
    }
    setRows((prev) => {
      const next = prev.filter((r) => !r.selected);
      return next.length ? next : [newSubject()];
    });
  };

  const save = () => {
    const filled = rows.filter((r) => r.name.trim());
    if (!filled.length) {
      alert("Add at least one subject with a name.");
      return;
    }
    for (let i = 0; i < filled.length; i++) {
      if (!filled[i].name.trim()) {
        alert(`Enter name for row ${i + 1}.`);
        return;
      }
    }
    const payload = filled.map((r) => ({
      name: r.name.trim(),
      shortName: (r.shortName || r.name).trim(),
    }));
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(payload));
    alert("Subjects database saved.");
  };

  const downloadSample = () => {
    downloadCsvFile("subjects-sample.csv", SUBJECTS_CSV_HEADERS, SUBJECTS_CSV_SAMPLE);
  };

  const uploadSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      const check = validateCsvFormat(parsed, SUBJECTS_CSV_HEADERS);
      if (!check.ok) {
        alert(check.message);
        return;
      }
      const imported = check.dataRows.map((cells) => ({
        ...newSubject(),
        name: cells[0] ?? "",
        shortName: cells[1] ?? "",
      }));
      setRows((prev) => {
        const existing = prev.filter((r) => r.name.trim() || r.shortName.trim());
        return [...(existing.length ? existing : []), ...imported];
      });
      alert(`Added ${imported.length} subject row(s) from CSV.`);
    };
    reader.readAsText(file);
  };

  const resetAll = () => {
    if (!window.confirm("Delete all subject entries?")) return;
    localStorage.removeItem(SUBJECTS_STORAGE_KEY);
    setRows([newSubject()]);
  };

  return (
    <section className="card settings-panel-compact">
      <h2 className="card-title">Subjects</h2>
      <p className="card-desc">Name and shortcut for each subject. S.no updates automatically when rows are deleted.</p>
      <CsvSampleButtons onDownload={downloadSample} onUploadFile={uploadSample} />

      <div className="period-table-wrap settings-form-compact">
        <table className="period-table">
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
                  aria-label="Select all subjects"
                />
              </th>
              <th style={{ width: "2.5rem" }}>S.no</th>
              <th style={{ width: "2.6rem" }} aria-label="Reorder" />
              <th>Name</th>
              <th>Shortcut</th>
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
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, "name", e.target.value)}
                    placeholder="Subject name"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.shortName}
                    onChange={(e) => updateRow(row.id, "shortName", e.target.value)}
                    placeholder="Shortcut"
                  />
                </td>
                <td className="classes-actions-cell">
                  <button type="button" className="add-period-btn" onClick={() => addAfter(row.id)} title="Add row below">
                    +
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-action-row">
        <button type="button" className="btn btn-ghost" onClick={deleteSelected}>
          Delete
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetAll}>
          Reset
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save
        </button>
      </div>
    </section>
  );
}
