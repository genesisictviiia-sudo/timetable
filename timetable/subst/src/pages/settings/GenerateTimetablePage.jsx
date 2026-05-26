import { useGenerateTimetable } from "../../hooks/useGenerateTimetable";
import TimetableGenerateSummary from "../../components/TimetableGenerateSummary";
import "../../App.css";

/** Standalone page (legacy). Timetable tab uses the hook directly. */
export default function GenerateTimetablePage({ onGenerated }) {
  const {
    initialCheck,
    lastResult,
    errors,
    warnings,
    generating,
    runGenerate,
    relaxationText,
    placedOnGrid,
  } = useGenerateTimetable(onGenerated);

  return (
    <section className="card settings-panel-compact">
      <div className="generate-timetable-actions">
        <button type="button" className="btn btn-primary" onClick={runGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate Timetable"}
        </button>
      </div>

      {!initialCheck.ok && (
        <div className="timetable-alert timetable-alert--error" role="alert">
          <ul>
            {initialCheck.errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="timetable-alert timetable-alert--error" role="alert">
          <ul>
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="timetable-alert timetable-alert--warn">
          <ul>
            {warnings.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <TimetableGenerateSummary
        lastResult={lastResult}
        relaxationText={relaxationText}
        placedOnGrid={placedOnGrid}
      />
    </section>
  );
}
