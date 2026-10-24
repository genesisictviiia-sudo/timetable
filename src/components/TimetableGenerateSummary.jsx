import { buildSubjectShortMap, toSubjectShortName } from "../lib/settingsStorage";
import { countPlacedSlotsOnGrid } from "../lib/timetableValidation";

export default function TimetableGenerateSummary({ lastResult, timetable, relaxationText, generationMeta }) {
  if (!lastResult) return null;

  const subjectShortMap = buildSubjectShortMap();

  // Live counts/lists — reflect manual drag-and-drop edits made since
  // generation, not just the frozen snapshot from when it was generated.
  const liveTimetable = timetable ?? lastResult;
  const placedOnGrid = countPlacedSlotsOnGrid(liveTimetable);
  const liveTray = liveTimetable.tray ?? [];

  // Configuration-error entries (unknown teacher, teacher not assigned to
  // this class/subject, …) never become tray cards — they can't be fixed by
  // dragging, only by correcting General Settings — so they're listed
  // separately and don't shrink as the tray is cleared.
  const configErrors = (lastResult.unassigned ?? []).filter((row) => !row.lessonId);

  return (
    <div className="generate-timetable-summary tt-generate-summary">
      <h3 className="settings-subtitle">Last generation</h3>
      <p className="card-desc card-desc--tight">
        {lastResult.schoolName && <span>{lastResult.schoolName} · </span>}
        {lastResult.academicYear && <span>{lastResult.academicYear} · </span>}
        Generated {new Date(lastResult.generatedAt).toLocaleString()}
        {generationMeta?.attemptsRun > 1 && (
          <span>
            {" "}
            · best of <strong>{generationMeta.attemptsRun}</strong> runs
            {generationMeta.bestTrayCount != null && (
              <>
                {" "}
                ({generationMeta.bestTrayCount} in tray)
              </>
            )}
          </span>
        )}
      </p>
      <ul className="generate-timetable-stats">
        <li>
          <strong>{lastResult.classes?.length ?? 0}</strong> classes
        </li>
        <li>
          <strong>{placedOnGrid}</strong> on grid
        </li>
        <li>
          <strong>{liveTray.length}</strong> in tray
        </li>
        {configErrors.length > 0 && (
          <li className="generate-timetable-stats--bad">
            <strong>{configErrors.length}</strong> config error{configErrors.length === 1 ? "" : "s"}
          </li>
        )}
      </ul>
      {relaxationText && (
        <p className="card-desc card-desc--tight generate-timetable-relax">
          <strong>Constraints:</strong> {relaxationText}
        </p>
      )}

      {liveTray.length > 0 && (
        <div className="timetable-unassigned">
          <h4 className="settings-subtitle">Unassigned lessons</h4>
          <p className="card-desc card-desc--tight" style={{ marginBottom: "0.5rem" }}>
            Still in the tray — drag each card onto the grid to place it.
          </p>
          <div className="period-table-wrap">
            <table className="period-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher(s)</th>
                </tr>
              </thead>
              <tbody>
                {liveTray.map((card) => (
                  <tr key={card.id}>
                    <td>{card.classLabel}</td>
                    <td title={card.subject}>{toSubjectShortName(card.subject, subjectShortMap)}</td>
                    <td>{card.teachers?.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {configErrors.length > 0 && (
        <div className="timetable-unassigned">
          <h4 className="settings-subtitle">Configuration errors</h4>
          <p className="card-desc card-desc--tight" style={{ marginBottom: "0.5rem" }}>
            These never reached the tray — fix them in General Settings, not by dragging.
          </p>
          <div className="period-table-wrap">
            <table className="period-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher(s)</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {configErrors.map((row, i) => (
                  <tr key={`${row.classLabel}-${row.subject}-${i}`}>
                    <td>{row.classLabel}</td>
                    <td title={row.subject}>{toSubjectShortName(row.subject, subjectShortMap)}</td>
                    <td>{row.teachers?.join(", ") || "—"}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
