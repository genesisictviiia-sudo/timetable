import { useEffect, useMemo, useState } from "react";
import {
  getClassLessons,
  loadClassesList,
  loadSchoolPeriodsPerWeek,
  loadSubjects,
  loadTeachers,
  saveClassLessonsForClass,
  saveClassMeta,
  syncTeacherLessonsFromClassLessons,
} from "../lib/settingsStorage";
import { flushPendingSyncs } from "../lib/userDataStorage";
import {
  CLASS_LESSONS_CSV_HEADERS,
  CLASS_LESSONS_CSV_SAMPLE,
  downloadCsvFile,
  parseCsv,
  validateCsvFormat,
} from "../lib/csvSample";
import { moveRowById } from "../lib/reorderRows";
import CsvSampleButtons from "./CsvSampleButtons";
import MoreClassesModal from "./MoreClassesModal";
import MoreTeachersModal from "./MoreTeachersModal";
import RowMoveButtons from "./RowMoveButtons";

function newLessonRow() {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    primaryTeacher: "",
    additionalTeachers: [],
    subject: "",
    lessonsPerWeek: "",
    groupId: null,
    additionalClasses: [],
    selected: false,
  };
}

function sumLessonsPerWeek(lessonRows) {
  return lessonRows.reduce((sum, l) => {
    const n = Number(l.lessonsPerWeek);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function parseAdditionalTeachers(cell) {
  if (!cell?.trim()) return [];
  return cell
    .split(/[;|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ClassLessonsModal({ open, classRow, onClose }) {
  const [teacherNames, setTeacherNames] = useState([]);
  const [subjectNames, setSubjectNames] = useState([]);
  const [otherClasses, setOtherClasses] = useState([]);
  const [lessons, setLessons] = useState([newLessonRow()]);
  const [moreTeachersFor, setMoreTeachersFor] = useState(null);
  const [moreClassesFor, setMoreClassesFor] = useState(null);
  const [schoolMaxPerWeek, setSchoolMaxPerWeek] = useState(null);
  const [classTeacher, setClassTeacher] = useState("");
  const [classTeacherSubject, setClassTeacherSubject] = useState("");

  useEffect(() => {
    if (!open || !classRow) return;

    const teachers = loadTeachers();
    if (!teachers.length) {
      alert("Please set the teachers list in General Settings → Teachers first.");
      onClose();
      return;
    }

    const subjects = loadSubjects();
    if (!subjects.length) {
      alert("Please set the subjects list in General Settings → Subjects first.");
      onClose();
      return;
    }

    setTeacherNames(teachers.map((t) => t.name));
    setSubjectNames(subjects.map((s) => s.name));
    const allClasses = loadClassesList();
    setOtherClasses(allClasses.filter((c) => c.id !== classRow.id));
    setSchoolMaxPerWeek(loadSchoolPeriodsPerWeek());

    // Load saved class teacher meta
    const thisCls = allClasses.find((c) => c.id === classRow.id);
    setClassTeacher(thisCls?.classTeacher || "");
    setClassTeacherSubject(thisCls?.classTeacherSubject || "");

    const saved = getClassLessons(classRow.id);
    if (saved.length) {
      setLessons(
        saved.map((item, i) => ({
          id: item.id || `lesson-${i}`,
          primaryTeacher: item.primaryTeacher ?? "",
          additionalTeachers: Array.isArray(item.additionalTeachers) ? item.additionalTeachers : [],
          subject: item.subject ?? "",
          lessonsPerWeek: item.lessonsPerWeek ?? "",
          groupId: item.groupId ?? null,
          additionalClasses: Array.isArray(item.additionalClasses) ? item.additionalClasses : [],
          selected: false,
        }))
      );
    } else {
      setLessons([newLessonRow()]);
    }
  }, [open, classRow, onClose]);

  const totalPerWeek = useMemo(() => sumLessonsPerWeek(lessons), [lessons]);
  const overSchoolLimit =
    schoolMaxPerWeek != null && totalPerWeek > schoolMaxPerWeek;

  // Reset class teacher selection if teacher is removed from lessons
  useEffect(() => {
    if (classTeacher && !lessons.some((l) => l.primaryTeacher === classTeacher)) {
      setClassTeacher("");
      setClassTeacherSubject("");
    }
  }, [lessons, classTeacher]);

  // Only teachers who have at least one lesson row in this class
  const classTeacherOptions = useMemo(() => {
    const names = new Set(lessons.map((l) => l.primaryTeacher).filter(Boolean));
    return [...names].sort();
  }, [lessons]);

  // Only subjects where the selected class teacher is the primary teacher
  const classTeacherSubjectOptions = useMemo(() => {
    if (!classTeacher) return [];
    const subjects = new Set(
      lessons
        .filter((l) => l.primaryTeacher === classTeacher && l.subject)
        .map((l) => l.subject)
    );
    return [...subjects].sort();
  }, [lessons, classTeacher]);

  if (!open || !classRow) return null;

  const headingTitle = String(classRow.title || "").trim() || "Untitled class";

  const checkTotalWithinLimit = (total, context) => {
    if (schoolMaxPerWeek == null) {
      alert(`Set "No. of periods per week" in School settings before ${context}.`);
      return false;
    }
    if (total > schoolMaxPerWeek) {
      alert(
        `Total lessons per week (${total}) cannot exceed the school limit (${schoolMaxPerWeek}) set in School settings.`
      );
      return false;
    }
    return true;
  };

  const updateLesson = (lessonId, field, value) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id !== lessonId) return l;
        const next = { ...l, [field]: value };
        if (field === "primaryTeacher") {
          next.additionalTeachers = l.additionalTeachers.filter((n) => n && n !== value);
        }
        return next;
      })
    );
  };

  const toggleSelected = (lessonId) => {
    setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, selected: !l.selected } : l)));
  };

  const addAfter = (afterId) => {
    setLessons((prev) => {
      const index = prev.findIndex((l) => l.id === afterId);
      const next = [...prev];
      next.splice(index + 1, 0, newLessonRow());
      return next;
    });
  };

  const moveLesson = (id, direction) => {
    setLessons((prev) => moveRowById(prev, id, direction));
  };

  const deleteSelected = () => {
    const n = lessons.filter((l) => l.selected).length;
    if (!n) {
      alert("Select lesson rows to delete.");
      return;
    }
    setLessons((prev) => {
      const next = prev.filter((l) => !l.selected);
      return next.length ? next : [newLessonRow()];
    });
  };

  const downloadLessonsSample = () => {
    downloadCsvFile("class-lessons-sample.csv", CLASS_LESSONS_CSV_HEADERS, CLASS_LESSONS_CSV_SAMPLE);
  };

  // Signature used to detect duplicate lesson rows (same teacher, subject,
  // periods, and set of additional classes).
  const lessonSignature = (l) =>
    [
      String(l.primaryTeacher || "").trim().toLowerCase(),
      String(l.subject || "").trim().toLowerCase(),
      String(Number(l.lessonsPerWeek) || 0),
      [...(l.additionalClasses || [])].sort().join(","),
    ].join("|");

  const uploadLessonsSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      // Accept both the new 5-column format (with "Additional classes") and
      // the legacy 4-column format.
      let check = validateCsvFormat(rows, CLASS_LESSONS_CSV_HEADERS);
      if (!check.ok) {
        const legacy = validateCsvFormat(rows, CLASS_LESSONS_CSV_HEADERS.slice(0, 4));
        if (legacy.ok) check = legacy;
        else {
          alert(check.message);
          return;
        }
      }

      // Resolve class names (title like "IA" or grade+section label like "1A")
      // to class ids, case-insensitively.
      const classIdByName = new Map();
      for (const c of otherClasses) {
        const title = String(c.title || "").trim().toLowerCase();
        const label = String(c.label || "").trim().toLowerCase();
        if (title && !classIdByName.has(title)) classIdByName.set(title, c.id);
        if (label && !classIdByName.has(label)) classIdByName.set(label, c.id);
      }
      const currentClassNames = new Set(
        [
          String(classRow.title || "").trim().toLowerCase(),
          [classRow.grade, classRow.section].filter(Boolean).join("").toLowerCase(),
        ].filter(Boolean)
      );

      const imported = [];
      const errors = [];

      check.dataRows.forEach((cells, i) => {
        // Teacher cell may hold several names separated by "/" — first is
        // primary, the rest are added to "More teachers".
        const teacherEntries = parseAdditionalTeachers(cells[0]);
        const teacher = teacherEntries[0] ?? "";
        const subject = cells[1]?.trim() ?? "";
        const lpw = cells[2]?.trim() ?? "";
        const extra = [...teacherEntries.slice(1), ...parseAdditionalTeachers(cells[3])];

        if (!teacherNames.includes(teacher)) {
          errors.push(`Row ${i + 2}: unknown teacher "${teacher}".`);
          return;
        }
        const unknownExtras = extra.filter((name) => !teacherNames.includes(name));
        if (unknownExtras.length) {
          errors.push(`Row ${i + 2}: unknown additional teacher(s) ${unknownExtras.map((n) => `"${n}"`).join(", ")}.`);
          return;
        }
        if (!subjectNames.includes(subject)) {
          errors.push(`Row ${i + 2}: unknown subject "${subject}".`);
          return;
        }
        const n = Number(lpw);
        if (!lpw || Number.isNaN(n) || n < 1) {
          errors.push(`Row ${i + 2}: invalid lessons per week.`);
          return;
        }

        // "Additional classes" column: names separated by "/", ";" or "|".
        // The lesson is shared with those classes on save (no duplication —
        // mirrored rows are matched by group id).
        const classNames = parseAdditionalTeachers(cells[4] ?? "");
        const additionalClasses = [];
        const unknownClasses = [];
        for (const rawName of classNames) {
          const key = rawName.trim().toLowerCase();
          if (!key || currentClassNames.has(key)) continue; // current class is implicit
          const id = classIdByName.get(key);
          if (!id) unknownClasses.push(rawName);
          else if (!additionalClasses.includes(id)) additionalClasses.push(id);
        }
        if (unknownClasses.length) {
          errors.push(`Row ${i + 2}: unknown class(es) ${unknownClasses.map((n2) => `"${n2}"`).join(", ")}.`);
          return;
        }

        imported.push({
          ...newLessonRow(),
          primaryTeacher: teacher,
          subject,
          lessonsPerWeek: String(n),
          additionalTeachers: [...new Set(extra)].filter((name) => name !== teacher),
          additionalClasses,
        });
      });

      if (errors.length) {
        alert(`Upload issues:\n${errors.slice(0, 8).join("\n")}${errors.length > 8 ? `\n...and ${errors.length - 8} more` : ""}`);
      }
      if (!imported.length) return;

      // Merge, skipping rows that already exist (no duplication).
      const kept = lessons.filter((l) => l.primaryTeacher || l.subject || l.lessonsPerWeek);
      const seen = new Set(kept.map(lessonSignature));
      const merged = [...kept];
      let skipped = 0;
      for (const row of imported) {
        const sig = lessonSignature(row);
        if (seen.has(sig)) {
          skipped++;
          continue;
        }
        seen.add(sig);
        merged.push(row);
      }

      const added = merged.length - kept.length;
      if (!added) {
        alert(`No new lessons added — ${skipped} duplicate row(s) skipped.`);
        return;
      }

      const base = merged.length ? merged : imported;
      const newTotal = sumLessonsPerWeek(base);
      if (!checkTotalWithinLimit(newTotal, "uploading lessons")) return;

      setLessons(base);
      alert(
        `Added ${added} lesson row(s) from CSV.` +
          (skipped ? ` Skipped ${skipped} duplicate(s).` : "")
      );
    };
    reader.readAsText(file);
  };

  const saveLessons = () => {
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i];
      if (!l.primaryTeacher) {
        alert(`Select a teacher for lesson ${i + 1}.`);
        return;
      }
      if (!l.subject) {
        alert(`Select a subject for lesson ${i + 1}.`);
        return;
      }
      const n = Number(l.lessonsPerWeek);
      if (!l.lessonsPerWeek || Number.isNaN(n) || n < 1) {
        alert(`Enter valid lessons per week for lesson ${i + 1}.`);
        return;
      }
    }

    if (!checkTotalWithinLimit(totalPerWeek, "saving lessons")) return;

    const payload = lessons.map((l) => ({
      id: l.id,
      primaryTeacher: l.primaryTeacher,
      additionalTeachers: l.additionalTeachers,
      subject: l.subject,
      lessonsPerWeek: Number(l.lessonsPerWeek),
      groupId: l.additionalClasses?.length ? l.groupId || l.id : null,
      additionalClasses: l.additionalClasses?.length ? l.additionalClasses : [],
    }));

    saveClassMeta(classRow.id, { classTeacher, classTeacherSubject });
    saveClassLessonsForClass(classRow.id, payload);
    flushPendingSyncs();
    alert(`Lessons saved for ${headingTitle}. Teacher lessons were updated from class lessons.`);
    onClose();
  };

  const activeLesson = moreTeachersFor ? lessons.find((l) => l.id === moreTeachersFor) : null;
  const activeClassesLesson = moreClassesFor ? lessons.find((l) => l.id === moreClassesFor) : null;

  return (
    <>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-card modal-card--wide"
          role="dialog"
          aria-labelledby="class-lessons-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="class-lessons-title" className="modal-title">
            {headingTitle}
          </h3>

          {/* Class Teacher section */}
          <div className="class-teacher-section">
            <span className="class-teacher-section__label">Class Teacher</span>
            <div className="class-teacher-section__fields">
              <select
                value={classTeacher}
                onChange={(e) => {
                  setClassTeacher(e.target.value);
                  setClassTeacherSubject("");
                  saveClassMeta(classRow.id, { classTeacher: e.target.value, classTeacherSubject: "" });
                  syncTeacherLessonsFromClassLessons();
                }}
              >
                <option value="">— Select teacher —</option>
                {classTeacherOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={classTeacherSubject}
                onChange={(e) => {
                  setClassTeacherSubject(e.target.value);
                  saveClassMeta(classRow.id, { classTeacher, classTeacherSubject: e.target.value });
                  syncTeacherLessonsFromClassLessons();
                }}
                disabled={!classTeacher || classTeacherSubjectOptions.length === 0}
              >
                <option value="">— Select subject —</option>
                {classTeacherSubjectOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {classTeacher && (
                <span className="class-teacher-section__badge">
                  {classTeacher}{classTeacherSubject ? ` · ${classTeacherSubject}` : ""}
                </span>
              )}
            </div>
          </div>

          <CsvSampleButtons onDownload={downloadLessonsSample} onUploadFile={uploadLessonsSample} />

          <div className="period-table-wrap settings-form-compact">
            <table className="period-table">
              <thead>
                <tr>
                  <th style={{ width: "2.2rem" }} aria-label="Select" />
                  <th style={{ width: "2.2rem" }}>S.no</th>
                  <th style={{ width: "2.6rem" }} aria-label="Reorder" />
                  <th>Teacher</th>
                  <th>Subject</th>
                  <th>Lessons / week</th>
                  <th style={{ width: "5rem" }}>More</th>
                  <th style={{ width: "2.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson, index) => (
                  <tr key={lesson.id}>
                    <td>
                      <input type="checkbox" checked={lesson.selected} onChange={() => toggleSelected(lesson.id)} />
                    </td>
                    <td>{index + 1}</td>
                    <td>
                      <RowMoveButtons
                        index={index}
                        total={lessons.length}
                        onMoveUp={() => moveLesson(lesson.id, "up")}
                        onMoveDown={() => moveLesson(lesson.id, "down")}
                      />
                    </td>
                    <td>
                      <select
                        value={lesson.primaryTeacher}
                        onChange={(e) => updateLesson(lesson.id, "primaryTeacher", e.target.value)}
                      >
                        <option value="">Teacher</option>
                        {teacherNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {lesson.additionalTeachers.length > 0 && (
                        <div className="teacher-extra-labels teacher-extra-labels--inline">
                          {lesson.additionalTeachers.map((name) => (
                            <span key={name} className="teacher-chip">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <select value={lesson.subject} onChange={(e) => updateLesson(lesson.id, "subject", e.target.value)}>
                        <option value="">Subject</option>
                        {subjectNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max={schoolMaxPerWeek ?? undefined}
                        value={lesson.lessonsPerWeek}
                        onChange={(e) => updateLesson(lesson.id, "lessonsPerWeek", e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="more-buttons-stack">
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            if (!lesson.primaryTeacher) {
                              alert("Select a teacher first.");
                              return;
                            }
                            setMoreTeachersFor(lesson.id);
                          }}
                        >
                          More teachers
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => setMoreClassesFor(lesson.id)}
                        >
                          More classes
                        </button>
                      </div>
                      {lesson.additionalClasses.length > 0 && (
                        <div className="teacher-extra-labels teacher-extra-labels--inline">
                          {lesson.additionalClasses.map((id) => {
                            const cls = otherClasses.find((c) => c.id === id);
                            return (
                              <span key={id} className="teacher-chip">
                                {String(cls?.title || "").trim() || cls?.label || id}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="classes-actions-cell">
                      <button type="button" className="add-period-btn" onClick={() => addAfter(lesson.id)} title="Add lesson">
                        +
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={`lessons-total-line${overSchoolLimit ? " lessons-total-line--over" : ""}`}>
            Total lessons / week: <strong>{totalPerWeek}</strong>
            {schoolMaxPerWeek != null ? (
              <>
                {" "}
                / {schoolMaxPerWeek} (school limit)
              </>
            ) : (
              <> — set periods per week in School settings</>
            )}
          </p>

          <div className="settings-action-row" style={{ marginTop: "8px" }}>
            <button type="button" className="btn btn-ghost" onClick={deleteSelected}>
              Delete selected
            </button>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLessons} disabled={overSchoolLimit}>
              Save lessons
            </button>
          </div>
        </div>
      </div>

      <MoreTeachersModal
        open={Boolean(moreTeachersFor && activeLesson)}
        allTeachers={teacherNames}
        primaryTeacher={activeLesson?.primaryTeacher ?? ""}
        initialSelected={activeLesson?.additionalTeachers ?? []}
        onClose={() => setMoreTeachersFor(null)}
        onSave={(names) => {
          if (moreTeachersFor) {
            updateLesson(moreTeachersFor, "additionalTeachers", names);
          }
        }}
      />

      <MoreClassesModal
        open={Boolean(moreClassesFor && activeClassesLesson)}
        allClasses={otherClasses}
        currentClassId={classRow.id}
        initialSelected={activeClassesLesson?.additionalClasses ?? []}
        onClose={() => setMoreClassesFor(null)}
        onSave={(classIds) => {
          if (moreClassesFor) {
            updateLesson(moreClassesFor, "additionalClasses", classIds);
          }
        }}
      />
    </>
  );
}
