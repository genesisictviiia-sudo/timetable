import { getTeacherLessonAt } from "../lib/teacherTimetableView";

export default function TeacherTimetableGrid({ timetable, teacherName }) {
  if (!timetable || !teacherName) {
    return <p className="card-desc">No teacher selected.</p>;
  }

  const columns = timetable.columns || [];
  const periodsPerDay = timetable.periodsPerDay || 1;
  const dayLabels = timetable.dayLabels || timetable.dayNames || [];

  const uniquePeriods = [];
  for (let p = 0; p < periodsPerDay; p++) {
    const col = columns.find((c) => c.period === p) || columns[p];
    uniquePeriods.push({
      period: p,
      periodLabel: col?.periodLabel || timetable.periodLabels?.[p] || `P${p + 1}`,
    });
  }

  const days = [];
  for (let d = 0; d < timetable.daysPerWeek; d++) {
    days.push({
      day: d,
      dayLabel: dayLabels[d] || columns.find((c) => c.day === d)?.dayLabel || `Day ${d + 1}`,
    });
  }

  return (
    <div className="tt-grid-wrap">
      <table className="period-table tt-grid tt-grid--teacher-view">
        <thead>
          <tr>
            <th className="tt-grid__day-col">Day</th>
            {uniquePeriods.map((p) => (
              <th key={p.period} className="tt-grid__period-col">
                {p.periodLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map(({ day, dayLabel }) => (
            <tr key={day}>
              <th className="tt-grid__day-label" scope="row">
                {dayLabel}
              </th>
              {uniquePeriods.map(({ period }) => {
                const lesson = getTeacherLessonAt(timetable, teacherName, day, period);
                return (
                  <td
                    key={`${day}-${period}`}
                    className={`tt-grid__cell${lesson ? "" : " tt-grid__cell--empty"}`}
                  >
                    {lesson ? (
                      <div className="tt-teacher-cell">
                        <div className="tt-teacher-cell__subject">{lesson.subject}</div>
                        <div className="tt-teacher-cell__class">{lesson.classLabel}</div>
                        {lesson.teachers.length > 1 && (
                          <div className="tt-teacher-cell__co">
                            + {lesson.teachers.filter((t) => t !== teacherName).join(", ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="tt-grid__empty-slot" aria-hidden>
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
