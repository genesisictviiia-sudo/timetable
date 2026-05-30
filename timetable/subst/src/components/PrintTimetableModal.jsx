import { useState } from "react";
import { loadInstitutionName } from "../lib/printTimetable";

const PER_PAGE_OPTIONS = [1, 2, 4];

export default function PrintTimetableModal({
  defaultKind = "class",
  hasCurrentClass = false,
  hasCurrentTeacher = false,
  onCancel,
  onPrint,
}) {
  const [institution, setInstitution] = useState(() => loadInstitutionName());
  const [perPage, setPerPage] = useState(1);
  const [kind, setKind] = useState(defaultKind);
  const [scope, setScope] = useState("all");

  const currentDisabled =
    (kind === "class" && !hasCurrentClass) || (kind === "teacher" && !hasCurrentTeacher);

  const handleKindChange = (next) => {
    setKind(next);
    if (
      (next === "class" && !hasCurrentClass) ||
      (next === "teacher" && !hasCurrentTeacher)
    ) {
      setScope("all");
    }
  };

  const submit = (e) => {
    e.preventDefault();
    onPrint({
      institution: institution.trim(),
      perPage: Number(perPage) || 1,
      kind,
      scope,
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Print setup">
      <div className="modal-card modal-card--wide">
        <h3 className="modal-title">Print / Save as PDF</h3>
        <p className="card-desc">
          Configure the printout. Choose <strong>Save as PDF</strong> in the print dialog to download.
        </p>

        <form onSubmit={submit} className="print-form">
          <label className="print-field">
            <span className="field-label">Name of the institution</span>
            <input
              type="text"
              className="field-input"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. Greenwood High School"
              autoFocus
            />
          </label>

          <label className="print-field">
            <span className="field-label">Timetables per A4 sheet</span>
            <select
              className="field-input"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </label>

          <label className="print-field">
            <span className="field-label">Type</span>
            <select
              className="field-input"
              value={kind}
              onChange={(e) => handleKindChange(e.target.value)}
            >
              <option value="class">Class timetables</option>
              <option value="teacher">Teacher timetables</option>
            </select>
          </label>

          <label className="print-field">
            <span className="field-label">Scope</span>
            <select
              className="field-input"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">
                All {kind === "class" ? "classes" : "teachers"}
              </option>
              <option value="current" disabled={currentDisabled}>
                Current {kind === "class" ? "class" : "teacher"} only
                {currentDisabled ? " (unavailable)" : ""}
              </option>
            </select>
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Print / Save PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
