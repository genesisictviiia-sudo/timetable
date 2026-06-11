import XLSX from "xlsx";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wb = XLSX.read(readFileSync(join(__dirname, "../src/data/timetabledatabase.xlsx")), { type: "buffer" });
const sheet = wb.Sheets["Teachers"];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
const names = rows.map((r) => r.Name || r["Name"] || "").filter(Boolean);
console.log("teacher rows", names.length, "sample", names.slice(0, 5));
