import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(__dirname, "../src/data/TeacherTabletable.pdf"));
const parser = new PDFParse({ data: new Uint8Array(buf) });
const result = await parser.getTable();
await parser.destroy();
let n = 0;
for (const page of result.pages) {
  n += page.tables.length;
  console.log("page", page.num, "tables", page.tables.length);
}
console.log("total tables", n);
