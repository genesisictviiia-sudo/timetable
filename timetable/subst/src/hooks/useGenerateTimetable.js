import { useCallback, useMemo, useState } from "react";
import { generateTimetable, validateTimetableInputs } from "../lib/generateTimetable";
import { freezeTimetable } from "../lib/timetableSnapshot";
import { loadGeneratedTimetable, saveGeneratedTimetable } from "../lib/timetableStorage";

function formatRelaxationSummary(relaxations) {
  if (!relaxations) return null;
  const items = [
    { key: "classTeacherFirstPeriod", label: "Class teacher first period" },
    { key: "maxClassesPerDay", label: "Maximum classes per day" },
    { key: "maxConsecutiveClassesPerDay", label: "Consecutive classes per day" },
    { key: "teacherTimeOff", label: "Teacher time off" },
  ];
  const used = items.filter((i) => (relaxations[i.key] ?? 0) > 0);
  if (!used.length) return "All school constraints were satisfied.";
  return used.map((i) => `${i.label}: relaxed ${relaxations[i.key]} time(s)`).join(" · ");
}

export function useGenerateTimetable(onGenerated) {
  const initialCheck = useMemo(() => validateTimetableInputs(), []);
  const [lastResult, setLastResult] = useState(() => loadGeneratedTimetable());
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState(initialCheck.warnings ?? []);
  const [generating, setGenerating] = useState(false);

  const runGenerate = useCallback(() => {
    const existing = loadGeneratedTimetable();
    if (
      existing?.frozen &&
      !window.confirm(
        "Replace the current timetable with a newly generated one? The saved timetable will be overwritten."
      )
    ) {
      return;
    }

    setGenerating(true);
    setErrors([]);
    setWarnings([]);

    const result = generateTimetable();

    setWarnings(result.warnings ?? []);

    if (!result.timetable) {
      setErrors(result.errors ?? ["Timetable could not be generated."]);
      setGenerating(false);
      return;
    }

    const frozen = freezeTimetable(result.timetable);
    saveGeneratedTimetable(frozen, { freeze: true });
    setLastResult(frozen);
    onGenerated?.(frozen);

    if (!result.success) {
      setErrors([
        `${result.timetable.stats.unassignedCount} lesson period(s) could not be placed. They are in the lesson tray — drag them onto the grid.`,
      ]);
    }

    setGenerating(false);
  }, [onGenerated]);

  const relaxationText = lastResult ? formatRelaxationSummary(lastResult.relaxations) : null;
  const placedOnGrid = lastResult ? Object.keys(lastResult.cells || {}).length : 0;

  return {
    initialCheck,
    lastResult,
    errors,
    warnings,
    generating,
    runGenerate,
    relaxationText,
    placedOnGrid,
  };
}
