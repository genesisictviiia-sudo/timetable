import { createPortal } from "react-dom";
import { getCurrentUser } from "../lib/authStorage";

function PeriodHeader({ col }) {
  return (
    <th
      key={col.slotIndex}
      className={
        col.isBreak
          ? "print-grid__period-head print-grid__period-head--break"
          : "print-grid__period-head"
      }
    >
      <span className="print-grid__period-name">{col.label}</span>
      {col.timeLabel ? (
        <span className="print-grid__period-time">{col.timeLabel}</span>
      ) : null}
    </th>
  );
}

export default function PrintableTimetable({
  institution,
  kind,
  perPage = 1,
  orientation = "landscape",
  data,
}) {
  if (!data || !data.items?.length) return null;

  const { periods, days, items } = data;
  const labelPrefix = kind === "class" ? "Class" : "Teacher";
  const pageSize = orientation === "portrait" ? "A4 portrait" : "A4 landscape";
  const pageMargin = perPage >= 4 ? "4mm" : perPage >= 2 ? "5mm" : "8mm";
  const isFree = !["prime", "pro"].includes(getCurrentUser()?.userType || "free");

  return createPortal(
    <>
      <style>{`
        @media print {
          @page {
            size: ${pageSize};
            margin: ${pageMargin};
          }
        }
      `}</style>
      <div
        className={`print-sheet print-sheet--per-${perPage} print-sheet--${orientation}${isFree ? " print-sheet--watermark" : ""}`}
      >
        {items.map((item, idx) => (
          <article
            key={`${item.title}-${idx}`}
            className={`print-card print-card--per-${perPage}`}
          >
            <header className="print-card__header">
              <h1 className="print-card__institution">{institution || " "}</h1>
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
                  {periods.map((col) => (
                    <PeriodHeader key={col.slotIndex} col={col} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d, dayRow) => (
                  <tr key={d.day}>
                    <th scope="row" className="print-grid__day-label">
                      {d.label}
                    </th>
                    {periods.map((col, pIdx) => {
                      if (col.isBreak) {
                        if (dayRow !== 0) return null;
                        return (
                          <td
                            key={col.slotIndex}
                            rowSpan={days.length}
                            className="print-grid__break-cell"
                          >
                            <span className="print-grid__break-label">{col.label}</span>
                            {col.timeLabel ? (
                              <span className="print-grid__break-time">{col.timeLabel}</span>
                            ) : null}
                          </td>
                        );
                      }

                      const cell = item.cells[dayRow]?.[pIdx];
                      if (!cell) {
                        return (
                          <td
                            key={col.slotIndex}
                            className="print-grid__cell print-grid__cell--empty"
                          >
                            —
                          </td>
                        );
                      }
                      // Teacher timetable: class first (primary), subject below
                      // (secondary) — the opposite order from the class timetable,
                      // where the subject is what the reader cares about first.
                      if (kind === "teacher") {
                        return (
                          <td key={col.slotIndex} className="print-grid__cell">
                            <div className="print-grid__subject">{cell.classLabel || ""}</div>
                            {cell.subject ? (
                              <div className="print-grid__teachers">{cell.subject}</div>
                            ) : null}
                          </td>
                        );
                      }

                      return (
                        <td key={col.slotIndex} className="print-grid__cell">
                          <div className="print-grid__subject">{cell.subject || ""}</div>
                          {cell.teachers?.length ? (
                            <div className="print-grid__teachers">
                              {cell.teachers.join(", ")}
                            </div>
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
      </div>
    </>,
    document.body
  );
}
