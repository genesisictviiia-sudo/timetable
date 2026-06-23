import { useEffect, useState } from "react";
import AddTeacherModal from "../../components/AddTeacherModal";
import CsvSampleButtons from "../../components/CsvSampleButtons";
import RowMoveButtons from "../../components/RowMoveButtons";
import TeacherLessonsModal from "../../components/TeacherLessonsModal";
import TeacherTimeOffModal from "../../components/TeacherTimeOffModal";
import {
  downloadCsvFile,
  parseCsv,
  parseTeacherLessonsCell,
  TEACHERS_CSV_HEADERS,
  TEACHERS_CSV_SAMPLE,
  validateCsvFormat,
} from "../../lib/csvSample";
import { moveRowAtIndex } from "../../lib/reorderRows";
import {
  deriveClassTeacherFromLessons,
  getClassTeacherInfo,
  loadClassesList,
  loadTeachersFull,
  saveClassTeacherForClass,
  saveClassTeacherInfo,
  saveTeachersFull,
  teacherListSummary,
  upsertLessonsIntoClassMap,
} from "../../lib/settingsStorage";
import "../../App.css";

function newTeacherRecord({ name, classTeacher = "", lessons = [] }) {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name,
    classTeacher,
    shortName: name,
    lessons,
    timeOffGrid: null,
    selected: false,
  };
}

export default function TeachersSettingsPage() {
  const [teachers, setTeachers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [showTimeOff, setShowTimeOff] = useState(false);

  const [search, setSearch] = useState("");

  const reloadTeachers = () =>
    setTeachers(loadTeachersFull().map((t) => ({ ...t, selected: false })));

  useEffect(() => {
    reloadTeachers();
  }, []);

  const q = search.trim().toLowerCase();
  const visibleTeachers = q
    ? teachers.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          String(t.classTeacher || "").toLowerCase().includes(q) ||
          (t.lessons || []).some((l) => l.subject?.toLowerCase().includes(q))
      )
    : teachers;

  const allChecked = visibleTeachers.length > 0 && visibleTeachers.every((t) => t.selected);
  const someChecked = visibleTeachers.some((t) => t.selected);

  const selected = teachers.find((t) => t.id === selectedId) ?? null;
  const hasSelection = Boolean(selected);

  const moveTeacher = (index, direction) => {
    setTeachers((prev) => moveRowAtIndex(prev, index, direction));
  };

  const toggleChecked = (id) => {
    setTeachers((prev) => prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)));
  };

  const toggleSelectAll = () => {
    const next = !allChecked;
    const visibleIds = new Set(visibleTeachers.map((t) => t.id));
    setTeachers((prev) =>
      prev.map((t) => (visibleIds.has(t.id) ? { ...t, selected: next } : t))
    );
  };

  const removeTeachers = (ids) => {
    setTeachers((prev) => {
      const next = prev.filter((t) => !ids.includes(t.id));
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      return next;
    });
  };

  const deleteOne = (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this teacher?")) return;
    removeTeachers([id]);
  };

  const deleteSelected = () => {
    const ids = teachers.filter((t) => t.selected).map((t) => t.id);
    if (!ids.length) {
      alert("Select one or more teachers using the checkboxes, then delete.");
      return;
    }
    if (!window.confirm(`Delete ${ids.length} selected teacher(s)?`)) return;
    removeTeachers(ids);
  };

  const addTeacher = ({ name, classTeacher = "" }) => {
    const record = newTeacherRecord({ name, classTeacher });
    setTeachers((prev) => [...prev, record]);
    setSelectedId(record.id);
  };

  const updateTeacherLessons = (teacherId, lessons, collaboratorMap = {}) => {
    const primaryTeacher = teachers.find((t) => t.id === teacherId);
    const teacherName = primaryTeacher?.name ?? "";

    // ── 1. Compute the full next teacher state ────────────────────────────────
    const nextState = teachers.map((t) => {
      if (t.id === teacherId) {
        return {
          ...t,
          lessons,
          classTeacher: deriveClassTeacherFromLessons(lessons),
          classTeacherSubject: lessons.find((l) => l.isClassTeacher)?.subject ?? "",
        };
      }
      const incoming = collaboratorMap[t.name];
      if (incoming && incoming.length) {
        const existingKept = (t.lessons || []).filter(
          (l) => !incoming.some((il) => il.subject === l.subject && il.classLabel === l.classLabel)
        );
        const incomingSeen = new Set();
        const incomingDeduped = incoming.filter((il) => {
          const k = `${il.subject}::${il.classLabel}`;
          if (incomingSeen.has(k)) return false;
          incomingSeen.add(k);
          return true;
        });
        const merged = [...existingKept, ...incomingDeduped];
        return { ...t, lessons: merged, classTeacher: deriveClassTeacherFromLessons(merged) };
      }
      return t;
    });

    // ── 2. Persist primary teacher state so subsequent reads see fresh data ───
    saveTeachersFull(nextState);

    // ── 3. Update class lesson map (carry isClassTeacher flag) ────────────────
    const classMapEntries = lessons.map((l) => ({
      subject: l.subject,
      classLabel: l.classLabel,
      primaryTeacher: teacherName,
      additionalTeachers: Array.isArray(l.additionalTeachers) ? l.additionalTeachers : [],
      periodsPerWeek: l.periodsPerWeek,
      isClassTeacher: Boolean(l.isClassTeacher),
    }));
    upsertLessonsIntoClassMap(classMapEntries);

    // ── 4. Sync class teacher assignments across both teacher record and class map ─
    //
    // saveClassTeacherForClass does three things in one call:
    //   a) writes classTeacherInfo (single source of truth keyed by classId)
    //   b) sets isClassTeacher:true on the exact subject row for the NEW teacher
    //   c) clears isClassTeacher + classTeacherSubject from the OLD teacher's record
    //
    // This means Class > Lessons immediately reflects the correct CT name + subject
    // AND the previous class teacher's record is cleaned up in the same write.
    const classesList = loadClassesList();
    const resolveClass = (label) => classesList.find((c) => c.label === label) ?? null;

    const prevLessons = primaryTeacher?.lessons || [];
    // Build map of classLabel → subject for the new CT assignments
    const nowCTMap = new Map(
      lessons
        .filter((l) => l.isClassTeacher && l.classLabel && l.subject)
        .map((l) => [l.classLabel, l.subject])
    );

    // Classes where this teacher LOST the CT role: clear classTeacherInfo only if
    // they were actually the stored CT (avoids wiping a legitimately different teacher).
    for (const pl of prevLessons) {
      if (!pl.isClassTeacher || !pl.classLabel || nowCTMap.has(pl.classLabel)) continue;
      const cls = resolveClass(pl.classLabel);
      if (!cls) continue;
      const current = getClassTeacherInfo(cls.id);
      if (current.teacherName === teacherName) {
        // Clear classTeacherInfo; teacher record already cleared in nextState (step 2).
        saveClassTeacherInfo(cls.id, "", "");
      }
    }

    // Classes where this teacher IS (or changed) the CT:
    // This also clears any previous class teacher's stale flags automatically.
    for (const [classLabel, subject] of nowCTMap) {
      const cls = resolveClass(classLabel);
      if (cls) saveClassTeacherForClass(classLabel, teacherName, subject, cls.id);
    }

    // ── 5. Reload authoritative state from localStorage ───────────────────────
    // saveClassTeacherForClass may have updated teachers other than the primary
    // (e.g. cleared the old CT's record). Reloading ensures React state matches
    // what is actually stored and what Class > Lessons will read on next open.
    setTeachers(loadTeachersFull().map((t) => ({ ...t, selected: false })));
  };

  const saveTimeOffGrid = (teacherId, timeOffGrid) => {
    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, timeOffGrid } : t)));
  };

  const saveAll = () => {
    saveTeachersFull(teachers);
    alert("All teachers and lessons saved.");
  };

  const openTimeOff = () => {
    setShowTimeOff(true);
  };

  const downloadSample = () => {
    downloadCsvFile("teachers-sample.csv", TEACHERS_CSV_HEADERS, TEACHERS_CSV_SAMPLE);
  };

  const uploadSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      const check = validateCsvFormat(parsed, TEACHERS_CSV_HEADERS);
      if (!check.ok) {
        alert(check.message);
        return;
      }
      const errors = [];
      const imported = check.dataRows.map((cells, i) => {
        const name = (cells[0] ?? "").trim();
        const classTeacher = (cells[1] ?? "").trim();
        const lessonEntries = parseTeacherLessonsCell(cells[2] ?? "");

        const invalid = lessonEntries.find(
          (l) => !l.subject || !l.classLabel || !Number.isFinite(l.periodsPerWeek) || l.periodsPerWeek < 1
        );
        if (invalid) {
          errors.push(`Row ${i + 2}: invalid lesson entry in "${cells[2] ?? ""}".`);
        }

        const lessons = lessonEntries.map((l) => ({
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          subject: l.subject,
          classLabel: l.classLabel,
          classLabels: l.classLabel,
          periodsPerWeek: l.periodsPerWeek,
          additionalTeachers: [],
          isClassTeacher: false,
        }));

        return newTeacherRecord({ name, classTeacher, lessons });
      });

      if (errors.length) {
        alert(`Upload issues:\n${errors.slice(0, 8).join("\n")}${errors.length > 8 ? `\n...and ${errors.length - 8} more` : ""}`);
        return;
      }

      const missing = imported.filter((t) => !t.name);
      if (missing.length) {
        alert("Each row must include a teacher name.");
        return;
      }

      setTeachers((prev) => [...prev, ...imported]);

      const classMapEntries = imported.flatMap((t) =>
        t.lessons.map((l) => ({
          subject: l.subject,
          classLabel: l.classLabel,
          primaryTeacher: t.name,
          additionalTeachers: [],
          periodsPerWeek: l.periodsPerWeek,
          isClassTeacher: false,
        }))
      );
      upsertLessonsIntoClassMap(classMapEntries);

      alert(`Added ${imported.length} teacher(s) from CSV.`);
    };
    reader.readAsText(file);
  };

  return (
    <section className="card settings-panel-compact">
      <h2 className="card-title">Teachers</h2>

      <CsvSampleButtons onDownload={downloadSample} onUploadFile={uploadSample} />

      <div className="teacher-toolbar">
        <input
          type="search"
          className="field-input search-input"
          placeholder="Search by name, class or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search teachers"
        />
        <button type="button" className="btn btn-primary btn--sm" onClick={() => setShowAdd(true)}>
          Add new
        </button>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          disabled={!hasSelection}
          onClick={() => setShowLessons(true)}
        >
          Lessons
        </button>
        <button type="button" className="btn btn-ghost btn--sm" disabled={!hasSelection} onClick={openTimeOff}>
          Time off
        </button>
      </div>

      <div className="period-table-wrap teacher-list-scroll settings-form-compact">
        <table className="period-table teacher-list-table">
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
                  aria-label="Select all teachers"
                />
              </th>
              <th style={{ width: "2.5rem" }}>S.no</th>
              <th style={{ width: "2.6rem" }} aria-label="Reorder" />
              <th>Name</th>
              <th>Class teacher</th>
              <th>Lessons / week</th>
              <th>Time off</th>
              <th style={{ width: "2.5rem" }} aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {visibleTeachers.length === 0 ? (
              <tr>
                <td colSpan={8} className="teacher-list-empty">
                  {teachers.length === 0
                    ? 'No teachers yet. Use "Add new" or upload a sample CSV.'
                    : `No teachers match "${search}".`}
                </td>
              </tr>
            ) : (
              visibleTeachers.map((t, index) => {
                const summary = teacherListSummary(t);
                const isSelected = t.id === selectedId;
                return (
                  <tr
                    key={t.id}
                    className={isSelected ? "teacher-row--selected" : ""}
                    onClick={() => setSelectedId(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(t.id);
                      }
                    }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(t.selected)}
                        onChange={() => toggleChecked(t.id)}
                        aria-label={`Select ${t.name}`}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <RowMoveButtons
                        index={index}
                        total={teachers.length}
                        stopPropagation
                        onMoveUp={() => moveTeacher(index, "up")}
                        onMoveDown={() => moveTeacher(index, "down")}
                      />
                    </td>
                    <td className="teacher-list-name">{t.name}</td>
                    <td>{summary.classTeacher}</td>
                    <td>{summary.lessonsPerWeek}</td>
                    <td>{summary.timeOff}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="row-delete-btn"
                        onClick={(e) => deleteOne(t.id, e)}
                        title="Delete teacher"
                        aria-label={`Delete ${t.name}`}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="settings-action-row">
        <button type="button" className="btn btn-ghost row-delete-action" onClick={deleteSelected} title="Delete selected">
          <span aria-hidden>🗑</span> Delete selected
        </button>
        <button type="button" className="btn btn-primary" onClick={saveAll}>
          Save
        </button>
      </div>

      <AddTeacherModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addTeacher} />

      <TeacherLessonsModal
        open={showLessons}
        teacher={selected}
        onClose={() => setShowLessons(false)}
        onSave={updateTeacherLessons}
      />

      <TeacherTimeOffModal
        open={showTimeOff}
        teacher={selected}
        onClose={() => setShowTimeOff(false)}
        onSave={saveTimeOffGrid}
      />
    </section>
  );
}
