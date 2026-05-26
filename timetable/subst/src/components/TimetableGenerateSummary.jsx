export default function TimetableGenerateSummary({ lastResult, relaxationText, placedOnGrid }) {
  if (!lastResult) return null;

  return (
    <div className="generate-timetable-summary tt-generate-summary">
      <h3 className="settings-subtitle">Last generation</h3>
      <p className="card-desc card-desc--tight">
        {lastResult.schoolName && <span>{lastResult.schoolName} · </span>}
        {lastResult.academicYear && <span>{lastResult.academicYear} · </span>}
        Generated {new Date(lastResult.generatedAt).toLocaleString()}
      </p>
      <ul className="generate-timetable-stats">
        <li>
          <strong>{lastResult.classes?.length ?? 0}</strong> classes
        </li>
        <li>
          <strong>{placedOnGrid}</strong> on grid
        </li>
        <li>
          <strong>{lastResult.tray?.length ?? 0}</strong> in tray
        </li>
        {lastResult.stats?.unassignedCount > 0 && (
          <li className="generate-timetable-stats--bad">
            <strong>{lastResult.stats.unassignedCount}</strong> unassigned
          </li>
        )}
      </ul>
      {relaxationText && (
        <p className="card-desc card-desc--tight generate-timetable-relax">
          <strong>Constraints:</strong> {relaxationText}
        </p>
      )}

      {lastResult.unassigned?.length > 0 && (
        <div className="timetable-unassigned">
          <h4 className="settings-subtitle">Unassigned lessons</h4>
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
                {lastResult.unassigned.map((row, i) => (
                  <tr key={`${row.classLabel}-${row.subject}-${i}`}>
                    <td>{row.classLabel}</td>
                    <td>{row.subject}</td>
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
