/* ---------------------------------------------------------------------------
 * Nawaf Mahmood - cover letter generator (server pipeline version)
 *
 * Usage:
 *   node build_cover_letter.js <content.json> <out.docx>
 *
 * Content JSON shape:
 * {
 *   "company_name":  "Acme Robotics",
 *   "body_content":  "Para 1...\n\nPara 2...\n\nPara 3..."   // may contain **bold**
 * }
 *
 * Matches the resume's font (Calibri) for a consistent application package.
 * ------------------------------------------------------------------------- */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink,
} = require('docx');

const LINK = "0563C1";

const contentPath = process.argv[2];
const outPath = process.argv[3];
if (!contentPath || !outPath) {
  console.error("Usage: node build_cover_letter.js <content.json> <out.docx>");
  process.exit(1);
}
let content = {};
try {
  content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
} catch (e) {
  console.error("Failed to read content JSON:", e.message);
  process.exit(1);
}

const companyName = String(content.company_name || "Hiring Team").replace(/[—–]/g, "-").trim();
const bodyContent = String(content.body_content || "");

const t = (text, opts = {}) => new TextRun({ text, size: 22, font: "Calibri", ...opts });
const b = (text) => new TextRun({ text, size: 22, font: "Calibri", bold: true });
const link = (text, url) => new ExternalHyperlink({
  link: url, children: [new TextRun({ text, size: 22, font: "Calibri", color: LINK, underline: {} })],
});

function clean(s) {
  return String(s == null ? "" : s).replace(/[—–]/g, "-");
}

// Parse **bold** markup within a single paragraph into runs.
function runs(markup) {
  const parts = clean(markup).replace(/\s+/g, " ").trim().split(/\*\*/);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    out.push(i % 2 === 1 ? b(parts[i]) : t(parts[i]));
  }
  if (out.length === 0) out.push(t(""));
  return out;
}

const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// Split body into paragraphs on blank lines.
const paragraphs = bodyContent
  .split(/\n\s*\n/)
  .map(p => p.trim())
  .filter(p => p.length > 0);
const bodyParagraphs = paragraphs.length ? paragraphs : [bodyContent.trim() || "Thank you for your consideration."];

const children = [
  // Header
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Nawaf Mahmood", bold: true, size: 32, font: "Calibri" })] }),
  new Paragraph({ spacing: { after: 20 }, children: [
    t("nawaf.mahmood2005@gmail.com | (416)-474-3996 | LinkedIn: "),
    link("Nawaf M", "https://www.linkedin.com/in/nawaf2005/"),
  ] }),
  new Paragraph({ spacing: { after: 240 }, children: [t(today)] }),
  new Paragraph({ spacing: { after: 0 }, children: [t("Hiring Manager")] }),
  new Paragraph({ spacing: { after: 240 }, children: [b(companyName)] }),
  new Paragraph({ spacing: { after: 200 }, children: [t("Dear Hiring Manager,")] }),
];

for (const p of bodyParagraphs) {
  children.push(new Paragraph({ spacing: { after: 200, line: 276, lineRule: "auto" }, children: runs(p) }));
}

children.push(new Paragraph({ spacing: { before: 120, after: 0 }, children: [t("Sincerely,")] }));
children.push(new Paragraph({ spacing: { before: 40 }, children: [t("Nawaf Mahmood")] }));

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log("cover letter docx written:", outPath);
}).catch(err => {
  console.error("Failed to build cover letter docx:", err);
  process.exit(1);
});
