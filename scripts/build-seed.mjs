// Convert the Desktop CSVs into a seed.json the running app can ingest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CSV_DIR = "/Users/divyachitimalla/Desktop/timetable-FULL-csv";
const OUT = path.join(ROOT, "public", "seed.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(CSV_DIR, name), "utf8"));
}

function uuid(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5");
}

const titleCase = (s) => String(s || "").trim();

// --- classes ---
const classesRows = readCsv("Classes.csv").slice(1); // skip header
const classes = [];
const classIdByShort = new Map();
for (const r of classesRows) {
  const short = (r[0] || "").trim();
  if (!short) continue;
  // grade = roman prefix, section = trailing letter(s)
  const m = short.match(/^([IVX]+)([A-Z]+)$/);
  const grade = m ? m[1] : short;
  const section = m ? m[2] : "";
  const id = uuid("class:" + short);
  classes.push({ id, grade, section, title: short });
  classIdByShort.set(short, id);
}

// --- subjects ---
const subjectsRows = readCsv("Subjects.csv").slice(1);
const subjects = [];
const subjectByShort = new Map();
const subjectByName = new Map();
for (const r of subjectsRows) {
  const name = (r[1] || "").trim();
  const shortName = (r[2] || name).trim();
  if (!name) continue;
  const id = uuid("subject:" + name);
  const rec = { id, name, shortName, timeOffGrid: null };
  subjects.push(rec);
  subjectByShort.set(shortName.toLowerCase(), rec);
  subjectByName.set(name.toLowerCase(), rec);
}

function resolveOrCreateSubject(rawName) {
  const name = (rawName || "").trim();
  if (!name) return null;
  const byName = subjectByName.get(name.toLowerCase());
  if (byName) return byName;
  const byShort = subjectByShort.get(name.toLowerCase());
  if (byShort) return byShort;
  // create new
  const shortName = name.split(/\s+/).map((w) => w[0]?.toUpperCase() || "").join("").slice(0, 6) || name.slice(0, 6).toUpperCase();
  const rec = { id: uuid("subject:" + name), name, shortName, timeOffGrid: null };
  subjects.push(rec);
  subjectByName.set(name.toLowerCase(), rec);
  subjectByShort.set(shortName.toLowerCase(), rec);
  return rec;
}

// --- teachers ---
const teachersRows = readCsv("Teachers.csv").slice(1);
const teachers = [];
const teacherByName = new Map();
for (const r of teachersRows) {
  const name = (r[1] || "").trim();
  const shortName = (r[2] || name).trim();
  const classTeacher = (r[3] || "").trim();
  if (!name) continue;
  const id = uuid("teacher:" + name);
  const rec = {
    id,
    name,
    shortName,
    phone: "",
    email: "",
    classTeacher,
    lessons: [],
    timeOffGrid: null,
  };
  teachers.push(rec);
  teacherByName.set(name.toLowerCase(), rec);
}

function findTeacher(rawName) {
  const name = (rawName || "").trim();
  if (!name) return null;
  const t = teacherByName.get(name.toLowerCase());
  return t || null;
}

// --- class lessons from "Classes lessons.csv" ---
const clRows = readCsv("Classes lessons.csv").slice(1);
const classLessons = {};
let currentClassShort = null;
const unknownClasses = new Set();
const unknownTeachers = new Set();
for (const r of clRows) {
  const c0 = (r[0] || "").trim();
  const c1 = (r[1] || "").trim();
  const c2 = (r[2] || "").trim();
  const c3 = (r[3] || "").trim();
  // empty row
  if (!c0 && !c1 && !c2 && !c3) continue;
  // class header row: only c0 present (e.g., "IA", optional total in c3)
  if (c0 && !c1 && !c2) {
    currentClassShort = c0;
    if (!classIdByShort.has(currentClassShort)) {
      unknownClasses.add(currentClassShort);
      currentClassShort = null;
    } else {
      classLessons[classIdByShort.get(currentClassShort)] = [];
    }
    continue;
  }
  // lesson row under current class
  if (!currentClassShort) continue;
  const teacher = c1;
  const subjectName = c2;
  const lpw = Number(c3);
  if (!teacher || !subjectName || !Number.isFinite(lpw) || lpw < 1) continue;
  const t = findTeacher(teacher);
  if (!t) { unknownTeachers.add(teacher); continue; }
  const subj = resolveOrCreateSubject(subjectName);
  if (!subj) continue;
  const classId = classIdByShort.get(currentClassShort);
  classLessons[classId].push({
    id: uuid(`lesson:${classId}:${subj.name}:${t.name}:${classLessons[classId].length}`),
    primaryTeacher: t.name,
    additionalTeachers: [],
    subject: subj.name,
    lessonsPerWeek: lpw,
  });
}

// --- derive teacher.lessons from classLessons (mirrors syncTeacherLessonsFromClassLessons) ---
const teacherLessonsMap = new Map();
for (const cls of classes) {
  const rows = classLessons[cls.id] || [];
  const classLabel = `${cls.grade}${cls.section}`;
  for (const row of rows) {
    const ppw = Number(row.lessonsPerWeek) || 0;
    if (!ppw) continue;
    const add = (teacherName) => {
      const t = findTeacher(teacherName);
      if (!t) return;
      if (!teacherLessonsMap.has(t.name)) teacherLessonsMap.set(t.name, []);
      teacherLessonsMap.get(t.name).push({
        id: uuid(`tl:${t.name}:${classLabel}:${row.subject}:${teacherLessonsMap.get(t.name).length}`),
        subject: row.subject,
        classLabel,
        periodsPerWeek: ppw,
        isClassTeacher: false,
      });
    };
    add(row.primaryTeacher);
    for (const extra of row.additionalTeachers || []) add(extra);
  }
}

for (const t of teachers) {
  const lessons = teacherLessonsMap.get(t.name) || [];
  // Mark the class-teacher's biggest lesson (largest periodsPerWeek) for their
  // homeroom class — needs >= daysPerWeek instances so P1 every day uses it.
  const ctShort = (t.classTeacher || "").trim();
  if (ctShort) {
    const ctCls = classes.find((c) => c.title === ctShort || `${c.grade}${c.section}` === ctShort);
    if (ctCls) {
      const ctLabel = `${ctCls.grade}${ctCls.section}`;
      const matches = lessons
        .filter((l) => l.classLabel === ctLabel)
        .sort((a, b) => (b.periodsPerWeek || 0) - (a.periodsPerWeek || 0));
      if (matches[0]) matches[0].isClassTeacher = true;
    }
  }
  t.lessons = lessons;
}

// --- school config: 5 days x 9 periods, 45/week ---
function pad(n) { return String(n).padStart(2, "0"); }
function addMinutes(time, mins) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

const periodDuration = 40;
const breakAfter = { 3: 15, 6: 30 }; // long break after P3, short after P6
let cursor = "08:30";
const periods = [];
for (let i = 1; i <= 8; i++) {
  const start = cursor;
  const end = addMinutes(start, periodDuration);
  periods.push({
    sno: periods.length + 1,
    name: `P${i}`,
    startTime: start,
    endTime: end,
    duration: `${periodDuration}m`,
    type: "lesson",
  });
  cursor = end;
  if (breakAfter[i]) {
    const bStart = cursor;
    const bEnd = addMinutes(bStart, breakAfter[i]);
    periods.push({
      sno: periods.length + 1,
      name: i === 3 ? "Long break" : "Break",
      startTime: bStart,
      endTime: bEnd,
      duration: `${breakAfter[i]}m`,
      type: "break",
    });
    cursor = bEnd;
  }
}

const school = {
  schoolName: "Genesis ICT VIIIA",
  academicYear: "2025-2026",
  periodsPerDay: 8,
  periodsPerWeek: 45,
  daysPerWeek: 6,
  constraints: {
    classTeacherFirstPeriod: true,
    maxClassesPerDay: 7,
    maxConsecutiveClassesPerDay: 4,
  },
  periods,
};

// --- write file ---
const payload = {
  school,
  classes,
  subjects,
  teachers,
  classLessons,
  _meta: {
    unknownClasses: [...unknownClasses],
    unknownTeachers: [...unknownTeachers],
    totals: {
      classes: classes.length,
      subjects: subjects.length,
      teachers: teachers.length,
      classLessonsRows: Object.values(classLessons).reduce((s, a) => s + a.length, 0),
      teacherLessonsTotal: teachers.reduce((s, t) => s + (t.lessons?.length || 0), 0),
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log("Wrote", OUT);
console.log("Totals:", payload._meta.totals);
if (unknownClasses.size) console.log("Unknown classes in lessons:", [...unknownClasses]);
if (unknownTeachers.size) console.log("Unknown teachers in lessons:", [...unknownTeachers].slice(0, 20));
