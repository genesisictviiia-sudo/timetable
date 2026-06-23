export function escapeCsvCell(cell) {
  return `"${String(cell ?? "").replace(/"/g, '""')}"`;
}

export function buildCsvContent(headers, dataRows) {
  const lines = [headers, ...dataRows].map((row) => row.map(escapeCsvCell).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadCsvFile(filename, headers, sampleRow) {
  const csv = buildCsvContent(headers, [sampleRow]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** @returns {string[][]} */
export function parseCsv(text) {
  const raw = text.replace(/^\uFEFF/, "").trim();
  if (!raw) return [];

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "") || cell) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export function normalizeHeader(h) {
  return String(h).trim().toLowerCase();
}

/** @returns {{ ok: boolean, message?: string, headers?: string[], dataRows?: string[][] }} */
export function validateCsvFormat(rows, expectedHeaders) {
  if (!rows.length) {
    return { ok: false, message: "The file is empty." };
  }

  const fileHeaders = rows[0].map(normalizeHeader);
  const expected = expectedHeaders.map(normalizeHeader);

  if (fileHeaders.length !== expected.length) {
    return {
      ok: false,
      message: `Expected ${expected.length} columns (${expectedHeaders.join(", ")}). Found ${fileHeaders.length}.`,
    };
  }

  for (let i = 0; i < expected.length; i++) {
    if (fileHeaders[i] !== expected[i]) {
      return {
        ok: false,
        message: `Column ${i + 1} should be "${expectedHeaders[i]}", found "${rows[0][i]}".`,
      };
    }
  }

  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim()));
  if (!dataRows.length) {
    return { ok: false, message: "No data rows found after the header." };
  }

  return { ok: true, headers: rows[0], dataRows };
}

export const CLASSES_CSV_HEADERS = ["Grade", "Section", "Class title"];
export const CLASSES_CSV_SAMPLE = ["10", "A", "Grade 10 Section A"];

export const CLASS_LESSONS_CSV_HEADERS = ["Teacher", "Subject", "Lessons per week", "Additional teachers"];
export const CLASS_LESSONS_CSV_SAMPLE = ["Teacher A", "Mathematics", "5", "Teacher B/Teacher C"];
export const CLASS_LESSONS_CSV_SAMPLE2 = ["Teacher D", "Science", "4", ""];
export const CLASS_LESSONS_CSV_SAMPLE3 = ["Teacher E", "English", "6", "Teacher F/Teacher G"];

export const SUBJECTS_CSV_HEADERS = ["Name", "Shortcut"];
export const SUBJECTS_CSV_SAMPLE = ["Mathematics", "Math"];

export const TEACHERS_CSV_HEADERS = ["Name", "Class teacher", "Lessons"];
export const TEACHERS_CSV_SAMPLE = ["Sample Teacher", "10A", "Mathematics:10A:5/Science:10B:4"];

/**
 * Parses a teacher CSV "Lessons" cell into lesson entries.
 * Format: "Subject:ClassLabel:PeriodsPerWeek" entries separated by "/".
 * @returns {{subject: string, classLabel: string, periodsPerWeek: number}[]}
 */
export function parseTeacherLessonsCell(cell) {
  if (!cell?.trim()) return [];
  return cell
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, classLabel, periodsPerWeek] = entry.split(":").map((p) => p?.trim() ?? "");
      return { subject, classLabel, periodsPerWeek: Number(periodsPerWeek) };
    });
}
