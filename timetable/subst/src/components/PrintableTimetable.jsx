import { createPortal } from "react-dom";

export default function PrintableTimetable({
  institution,
  kind,
  perPage = 1,
  data,
}) {
  if (!data || !data.items?.length) return null;

  const { periods, days, items } = data;
  const labelPrefix = kind === "class" ? "Class" : "Teacher";

  return createPortal(
    <div className={`print-sheet print-sheet--per-${perPage}`}>
      {items.map((item, idx) => (
        <article
          key={`${item.title}-${idx}`}
          className={`print-card print-card--per-${perPage}`}
        >
          <header className="print-card__header">
            <h1 className="print-card__institution">
              {institution || " "}
            </h1>
            <h2 className="print-card__subject">
              <span className="print-card__subject-prefix">{labelPrefix}: </span>
              {item.title}
              {item.subtitle ? (
                <span className="print-card__subject-meta"> ({item.subtitle})</span>
              ) : null}
            </h2>
          </header>

          <table className="print-grid">
            <thead>
              <tr>
                <th className="print-grid__day-head">Day</th>
                {periods.map((p) => (
                  <th key={p.period} className="print-grid__period-head">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, dayRow) => (
                <tr key={d.day}>
                  <th scope="row" className="print-grid__day-label">
                    {d.label}
                  </th>
                  {periods.map((p, pIdx) => {
                    const cell = item.cells[dayRow]?.[pIdx];
                    if (!cell) {
                      return (
                        <td key={p.period} className="print-grid__cell print-grid__cell--empty">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={p.period} className="print-grid__cell">
                        <div className="print-grid__subject">{cell.subject || ""}</div>
                        {kind === "class" && cell.teachers?.length ? (
                          <div className="print-grid__teachers">
                            {cell.teachers.join(", ")}
                          </div>
                        ) : null}
                        {kind === "teacher" && cell.classLabel ? (
                          <div className="print-grid__teachers">{cell.classLabel}</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>,
    document.body
  );
}
