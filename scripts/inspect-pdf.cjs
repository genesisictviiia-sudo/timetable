const fs = require("fs");
const pdf = require("pdf-parse");

const paths = [
  "../src/data/TeacherTabletable.pdf",
  "../src/data/ClassTimetable.pdf",
];

async function main() {
  for (const p of paths) {
    const buf = fs.readFileSync(require("path").join(__dirname, p));
    const data = await pdf(buf);
    console.log("\n===", p, "pages:", data.numpages, "===");
    console.log(data.text.slice(0, 12000));
  }
}

main().catch(console.error);
