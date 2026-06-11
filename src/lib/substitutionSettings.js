import { readUserJson, writeUserJson } from "./userDataStorage";

export const SUBSTITUTION_SETTINGS_KEY = "substitution-settings-v1";
export const DEFAULT_MAX_WEEKLY_TOTAL = 31;

function normalizeExcludedTeachers(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => String(x || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function loadSubstitutionSettings() {
  const raw = readUserJson(SUBSTITUTION_SETTINGS_KEY, null);
  const n = Number(raw?.maxWeeklyTotal);
  return {
    maxWeeklyTotal: Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MAX_WEEKLY_TOTAL,
    excludedTeachers: normalizeExcludedTeachers(raw?.excludedTeachers),
  };
}

export function saveSubstitutionSettings(partial) {
  const current = loadSubstitutionSettings();
  const nextMax = partial?.maxWeeklyTotal !== undefined ? Number(partial.maxWeeklyTotal) : current.maxWeeklyTotal;
  const nextExcluded =
    partial?.excludedTeachers !== undefined
      ? normalizeExcludedTeachers(partial.excludedTeachers)
      : current.excludedTeachers;

  writeUserJson(SUBSTITUTION_SETTINGS_KEY, {
    maxWeeklyTotal:
      Number.isFinite(nextMax) && nextMax > 0 ? Math.round(nextMax) : DEFAULT_MAX_WEEKLY_TOTAL,
    excludedTeachers: nextExcluded,
  });
}
