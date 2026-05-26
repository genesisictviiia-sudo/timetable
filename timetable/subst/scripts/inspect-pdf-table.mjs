import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(__dirname, "../src/data/TeacherTabletable.pdf"));
const parser = new PDFParse({ data: new Uint8Array(buf) });
const tables = await parser.getTable({ partial: [1] });
await parser.destroy();
console.log(JSON.stringify(tables, null, 2).slice(0, 25000));
