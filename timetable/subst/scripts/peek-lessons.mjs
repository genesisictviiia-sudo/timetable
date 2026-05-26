import XLSX from "xlsx";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wb = XLSX.read(readFileSync(join(__dirname, "../src/data/timetabledatabase.xlsx")), { type: "buffer" });
const lessons = XLSX.utils.sheet_to_json(wb.Sheets["Lessons"], { defval: "" });
const lak = lessons.filter((l) => String(l.Teacher).toLowerCase().includes("lakshmi manjula"));
console.log("Lakshmi lessons count", lak.length, lak.slice(0, 8));
