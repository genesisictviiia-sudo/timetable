import { useCallback, useMemo, useState } from "react";
import {
  GENERATION_ATTEMPTS,
  generateTimetableAsync,
  validateTimetableInputs,
} from "../lib/generateTimetable";
import { countPlacedSlotsOnGrid } from "../lib/timetableValidation";
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
  const [generationProgress, setGenerationProgress] = useState(null);
  const [generationMeta, setGenerationMeta] = useState(null);

  const runGenerate = useCallback(async () => {
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
    setGenerationProgress({ attempt: 0, maxAttempts: GENERATION_ATTEMPTS, bestTrayCount: null });
    setErrors([]);
    setWarnings([]);

    try {
      const result = await generateTimetableAsync({
        maxAttempts: GENERATION_ATTEMPTS,
        onProgress: setGenerationProgress,
      });

      setWarnings(result.warnings ?? []);
      setGenerationMeta(result.meta ?? null);

      if (!result.timetable) {
        setErrors(result.errors ?? ["Timetable could not be generated."]);
        return;
      }

      const frozen = freezeTimetable(result.timetable);
      saveGeneratedTimetable(frozen, { freeze: true });
      setLastResult(frozen);
      onGenerated?.(frozen);

      if (!result.success) {
        const runs = result.meta?.attemptsRun ?? GENERATION_ATTEMPTS;
        const tray = result.meta?.bestTrayCount ?? result.timetable.stats?.unassignedCount ?? 0;
        setErrors([
          `After ${runs} generation run(s), ${tray} lesson period(s) could not be placed. They are in the lesson tray — drag them onto the grid.`,
        ]);
      }
    } finally {
      setGenerating(false);
      setGenerationProgress(null);
    }
  }, [onGenerated]);

  const relaxationText = lastResult ? formatRelaxationSummary(lastResult.relaxations) : null;
  const placedOnGrid = lastResult ? countPlacedSlotsOnGrid(lastResult) : 0;

  return {
    initialCheck,
    lastResult,
    errors,
    warnings,
    generating,
    generationProgress,
    generationMeta,
    runGenerate,
    relaxationText,
    placedOnGrid,
  };
}
