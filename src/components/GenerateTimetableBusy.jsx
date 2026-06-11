export default function GenerateTimetableBusy({ progress }) {
  const attempt = progress?.attempt ?? 0;
  const maxAttempts = progress?.maxAttempts ?? 0;
  const bestTrayCount = progress?.bestTrayCount;

  return (
    <div className="gen-busy-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="gen-busy-card">
        <div className="gen-busy-spinner" aria-hidden="true" />
        <p className="gen-busy-title">Generating timetable</p>
        <p className="gen-busy-detail">
          {attempt > 0 && maxAttempts > 0 ? (
            <>
              Run <strong>{attempt}</strong> of <strong>{maxAttempts}</strong>
              {bestTrayCount != null && (
                <>
                  {" "}
                  · best tray so far: <strong>{bestTrayCount}</strong>
                </>
              )}
            </>
          ) : (
            "Preparing…"
          )}
        </p>
        <p className="gen-busy-hint">Trying multiple layouts to minimize lessons left in the tray</p>
      </div>
    </div>
  );
}
