import { useCallback, useEffect, useMemo, useState } from "react";
import BottomTray from "../components/BottomTray";
import PrintTimetableModal from "../components/PrintTimetableModal";
import PrintableTimetable from "../components/PrintableTimetable";
import TimetableGenerateSummary from "../components/TimetableGenerateSummary";
import TeacherTimetableGrid from "../components/TeacherTimetableGrid";
import TimetableGrid from "../components/TimetableGrid";
import { useGenerateTimetable } from "../hooks/useGenerateTimetable";
import { buildPrintData } from "../lib/printTimetable";
import { countTeacherLessons, listTeachersForView } from "../lib/teacherTimetableView";
import { getAllottedLessonsPerWeek, getSchoolPeriodsPerWeek, removeCardToTray, toggleCardFixed } from "../lib/timetableValidation";
import { loadGeneratedTimetable, saveGeneratedTimetable } from "../lib/timetableStorage";
import "../App.css";

export default function TimetablePage() {
  const [timetable, setTimetable] = useState(null);
  const [viewMode, setViewMode] = useState("class");
  const [classIndex, setClassIndex] = useState(0);
  const [teacherIndex, setTeacherIndex] = useState(0);
  const [warning, setWarning] = useState("");
  const [trayDragOver, setTrayDragOver] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printJob, setPrintJob] = useState(null);

  const loadTimetable = useCallback(() => {
    const loaded = loadGeneratedTimetable();
    setTimetable(loaded);
    return loaded;
  }, []);

  useEffect(() => {
    loadTimetable();
    setClassIndex(0);
  }, [loadTimetable]);

  useEffect(() => {
    if (!draggingCardId) return undefined;
    const endDrag = () => setDraggingCardId(null);
    window.addEventListener("dragend", endDrag);
    return () => window.removeEventListener("dragend", endDrag);
  }, [draggingCardId]);

  const persist = useCallback((next) => {
    const withMeta = {
      ...next,
      frozen: next.frozen ?? timetable?.frozen ?? false,
      frozenAt: next.frozenAt ?? timetable?.frozenAt,
      snapshot: next.snapshot ?? timetable?.snapshot,
      updatedAt: new Date().toISOString(),
    };
    setTimetable(withMeta);
    saveGeneratedTimetable(withMeta);
  }, [timetable]);

  const handleGenerated = useCallback((generated) => {
    setTimetable(generated);
    setClassIndex(0);
    setTeacherIndex(0);
    setViewMode("class");
    setWarning("");
    setDraggingCardId(null);
  }, []);

  const {
    initialCheck,
    lastResult,
    errors: genErrors,
    warnings: genWarnings,
    generating,
    runGenerate,
    relaxationText,
    placedOnGrid,
  } = useGenerateTimetable(handleGenerated);

  const teachers = useMemo(() => listTeachersForView(timetable), [timetable]);
  const classes = timetable?.classes ?? [];
  const totalClasses = classes.length;
  const totalTeachers = teachers.length;
  const safeClassIndex = totalClasses ? Math.min(classIndex, totalClasses - 1) : 0;
  const safeTeacherIndex = totalTeachers ? Math.min(teacherIndex, totalTeachers - 1) : 0;
  const currentClass = classes[safeClassIndex] ?? null;
  const currentTeacher = teachers[safeTeacherIndex] ?? null;

  const totalTrayCount = timetable?.tray?.length ?? 0;

  const classTrayCards = useMemo(() => {
    if (!timetable?.tray?.length || !currentClass) return [];
    return timetable.tray.filter((c) => c.classId === currentClass.id);
  }, [timetable?.tray, currentClass]);

  const teacherTrayCards = useMemo(() => {
    if (!timetable?.tray?.length || !currentTeacher) return [];
    return timetable.tray.filter((c) => c.teachers?.includes(currentTeacher));
  }, [timetable?.tray, currentTeacher]);

  const allottedForClass = useMemo(() => {
    if (!currentClass) return 0;
    return getAllottedLessonsPerWeek(currentClass.id);
  }, [currentClass]);

  const schoolPeriodsPerWeek = getSchoolPeriodsPerWeek();

  const handleTimetableChange = useCallback(
    (next) => {
      persist(next);
    },
    [persist]
  );

  const handleDropOnTray = useCallback(
    (cardId) => {
      if (!timetable) return;
      const result = removeCardToTray(timetable, cardId);
      if (!result.ok) {
        setWarning(result.message);
        return;
      }
      setWarning("");
      persist(result.timetable);
      setTrayDragOver(false);
    },
    [timetable, persist]
  );

  const handleDragStart = useCallback((cardId) => {
    setDraggingCardId(cardId);
    setWarning("");
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingCardId(null);
  }, []);

  const goPrev = () => {
    setWarning("");
    setDraggingCardId(null);
    if (viewMode === "teacher") {
      setTeacherIndex((i) => (i <= 0 ? totalTeachers - 1 : i - 1));
    } else {
      setClassIndex((i) => (i <= 0 ? totalClasses - 1 : i - 1));
    }
  };

  const goNext = () => {
    setWarning("");
    setDraggingCardId(null);
    if (viewMode === "teacher") {
      setTeacherIndex((i) => (i >= totalTeachers - 1 ? 0 : i + 1));
    } else {
      setClassIndex((i) => (i >= totalClasses - 1 ? 0 : i + 1));
    }
  };

  const switchView = (mode) => {
    setViewMode(mode);
    setWarning("");
    setDraggingCardId(null);
  };

  const handlePrintRequest = useCallback(
    ({ institution, perPage, kind, scope, orientation }) => {
      if (!timetable) return;
      const data = buildPrintData(timetable, kind, scope, {
        classId: currentClass?.id,
        teacherName: currentTeacher,
      });
      if (!data.items.length) {
        setWarning(
          kind === "class"
            ? "No classes available to print."
            : "No teachers available to print."
        );
        setPrintOpen(false);
        return;
      }
      setPrintJob({
        institution,
        perPage,
        kind,
        orientation: orientation || "landscape",
        data,
      });
      setPrintOpen(false);
    },
    [timetable, currentClass, currentTeacher]
  );

  useEffect(() => {
    if (!printJob) return undefined;
    const handle = window.setTimeout(() => {
      window.print();
    }, 60);
    const cleanup = () => setPrintJob(null);
    window.addEventListener("afterprint", cleanup, { once: true });
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener("afterprint", cleanup);
    };
  }, [printJob]);

  const classTitle = currentClass?.title || currentClass?.label;
  const hasTimetable = Boolean(timetable?.classes?.length);
  const isFrozen = Boolean(timetable?.frozen);
  const isClassView = viewMode === "class";
  const teacherLessonsCount = useMemo(() => {
    if (!timetable || !currentTeacher) return 0;
    return countTeacherLessons(timetable, currentTeacher);
  }, [timetable, currentTeacher]);

  return (
    <div className="page-content tt-page">
      <section className="card tt-page__card">
        <h2 className="card-title tt-page__title">Time Table</h2>

        <div className="tt-page__generate-row">
          <button
            type="button"
            className="btn btn-primary btn--sm"
            onClick={runGenerate}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate Timetable"}
          </button>
          {hasTimetable && (
            <>
              <div className="tt-view-toggle" role="tablist" aria-label="Timetable view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isClassView}
                  className={`tt-view-toggle__btn${isClassView ? " tt-view-toggle__btn--active" : ""}`}
                  onClick={() => switchView("class")}
                >
                  Class Timetable
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isClassView}
                  className={`tt-view-toggle__btn${!isClassView ? " tt-view-toggle__btn--active" : ""}`}
                  onClick={() => switchView("teacher")}
                >
                  Teacher Timetable
                </button>
              </div>
              {isClassView ? (
                <div className="tt-tray-total" role="status">
                  <span className="tt-tray-total__label">Tray</span>
                  <span className="tt-tray-total__value">{totalTrayCount}</span>
                </div>
              ) : (
                <div className="tt-tray-total" role="status">
                  <span className="tt-tray-total__label">Tray</span>
                  <span className="tt-tray-total__value">{teacherTrayCards.length}</span>
                </div>
              )}
              <button
                type="button"
                className="btn btn-outline btn--sm"
                onClick={() => setPrintOpen(true)}
                title="Print or save as PDF"
              >
                Print
              </button>
            </>
          )}
        </div>

        {hasTimetable && isFrozen && (
          <p className="tt-page__frozen-note" role="status">
            Saved timetable — only changes when you click <strong>Generate Timetable</strong>. Refreshing the page
            or editing General Settings does not alter this schedule.
          </p>
        )}

        {warning && (
          <div className="timetable-alert timetable-alert--error tt-warning tt-warning--inline" role="alert">
            <button type="button" className="tt-warning__close" onClick={() => setWarning("")} aria-label="Dismiss">
              ×
            </button>
            {warning}
          </div>
        )}

        {hasTimetable && isClassView && currentClass ? (
          <>
            <div className="tt-class-view">
              <button
                type="button"
                className="tt-side-nav"
                onClick={goPrev}
                aria-label="Previous class"
                title="Previous class"
              >
                ‹
              </button>

              <div className="tt-class-view__main">
                <header className="tt-class-header">
                  <span className="tt-class-header__counter">
                    {safeClassIndex + 1} / {totalClasses}
                  </span>
                  <h3 className="tt-class-header__title">{classTitle}</h3>
                  <span className="tt-class-header__meta">
                    {allottedForClass}/{schoolPeriodsPerWeek} allotted · {classTrayCards.length} in tray
                  </span>
                </header>

                <TimetableGrid
                  timetable={timetable}
                  currentClass={currentClass}
                  draggingCardId={draggingCardId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onTimetableChange={handleTimetableChange}
                  onWarning={setWarning}
                  onClearWarning={() => setWarning("")}
                />
              </div>

              <button
                type="button"
                className="tt-side-nav"
                onClick={goNext}
                aria-label="Next class"
                title="Next class"
              >
                ›
              </button>
            </div>

            <BottomTray
              tray={classTrayCards}
              classLabel={classTitle}
              dragOver={trayDragOver}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={() => setTrayDragOver(true)}
              onDragLeave={() => setTrayDragOver(false)}
              onDropFromGrid={handleDropOnTray}
              onToggleFixed={(cardId) => {
                const result = toggleCardFixed(timetable, cardId);
                if (!result.ok) {
                  setWarning(result.message);
                  return;
                }
                setWarning("");
                persist(result.timetable);
              }}
            />
          </>
        ) : hasTimetable && !isClassView && currentTeacher ? (
          <>
            <div className="tt-class-view">
              <button
                type="button"
                className="tt-side-nav"
                onClick={goPrev}
                aria-label="Previous teacher"
                title="Previous teacher"
              >
                ‹
              </button>

              <div className="tt-class-view__main">
                <header className="tt-class-header">
                  <span className="tt-class-header__counter">
                    {safeTeacherIndex + 1} / {totalTeachers}
                  </span>
                  <h3 className="tt-class-header__title">{currentTeacher}</h3>
                  <span className="tt-class-header__meta">
                    {teacherLessonsCount} scheduled · {teacherTrayCards.length} in tray
                  </span>
                </header>

                <TeacherTimetableGrid
                  timetable={timetable}
                  teacherName={currentTeacher}
                  draggingCardId={draggingCardId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onTimetableChange={handleTimetableChange}
                  onWarning={setWarning}
                  onClearWarning={() => setWarning("")}
                />
              </div>

              <button
                type="button"
                className="tt-side-nav"
                onClick={goNext}
                aria-label="Next teacher"
                title="Next teacher"
              >
                ›
              </button>
            </div>

            <BottomTray
              tray={teacherTrayCards}
              classLabel={currentTeacher}
              trayLabel={`Lessons left for ${currentTeacher}`}
              dragOver={trayDragOver}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={() => setTrayDragOver(true)}
              onDragLeave={() => setTrayDragOver(false)}
              onDropFromGrid={handleDropOnTray}
              onToggleFixed={(cardId) => {
                const result = toggleCardFixed(timetable, cardId);
                if (!result.ok) {
                  setWarning(result.message);
                  return;
                }
                setWarning("");
                persist(result.timetable);
              }}
            />
          </>
        ) : hasTimetable && !isClassView && totalTeachers === 0 ? (
          <p className="card-desc tt-page__empty-hint">No teachers in General Settings. Add teachers to view teacher timetables.</p>
        ) : (
          !generating && (
            <p className="card-desc tt-page__empty-hint">
              No timetable yet. Click <strong>Generate Timetable</strong> to build one from your General Settings.
            </p>
          )
        )}

        {!initialCheck.ok && !hasTimetable && (
          <div className="timetable-alert timetable-alert--error" role="alert">
            <strong>Cannot generate — complete General Setting first:</strong>
            <ul>
              {initialCheck.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {!initialCheck.ok && hasTimetable && (
          <div className="timetable-alert timetable-alert--warn" role="status">
            General settings have changed since this timetable was saved. The displayed timetable is unchanged.
            Fix settings before generating a new one.
          </div>
        )}

        {initialCheck.ok && initialCheck.warnings?.length > 0 && (
          <div className="timetable-alert timetable-alert--warn">
            <ul>
              {initialCheck.warnings.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {genErrors.length > 0 && (
          <div className="timetable-alert timetable-alert--error" role="alert">
            <ul>
              {genErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {genWarnings.length > 0 && genErrors.length === 0 && (
          <div className="timetable-alert timetable-alert--warn">
            <ul>
              {genWarnings.map((msg) => (
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

      {printOpen && (
        <PrintTimetableModal
          defaultKind={isClassView ? "class" : "teacher"}
          hasCurrentClass={Boolean(currentClass)}
          hasCurrentTeacher={Boolean(currentTeacher)}
          onCancel={() => setPrintOpen(false)}
          onPrint={handlePrintRequest}
        />
      )}

      {printJob && (
        <PrintableTimetable
          institution={printJob.institution}
          kind={printJob.kind}
          perPage={printJob.perPage}
          orientation={printJob.orientation}
          data={printJob.data}
        />
      )}
    </div>
  );
}
