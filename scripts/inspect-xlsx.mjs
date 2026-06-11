import XLSX from "xlsx";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "../src/data/timetabledatabase.xlsx");
const wb = XLSX.read(readFileSync(path), { type: "buffer" });

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  console.log("\n=== SHEET:", name, "rows:", rows.length, "===");
  console.log(JSON.stringify(rows.slice(0, 25), null, 0).slice(0, 8000));
}
