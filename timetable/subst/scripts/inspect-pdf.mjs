import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __dirname = dirname(fileURLToPath(import.meta.url));

const paths = ["TeacherTabletable.pdf", "ClassTimetable.pdf"];

for (const name of paths) {
  const buf = readFileSync(join(__dirname, "../src/data", name));
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  await parser.destroy();
  console.log("\n===", name, "pages:", result.total, "===");
  console.log(result.text.slice(0, 20000));
}
