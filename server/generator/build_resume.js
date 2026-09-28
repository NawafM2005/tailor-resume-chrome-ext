/* ---------------------------------------------------------------------------
 * Nawaf Mahmood - resume generator (server pipeline version)
 *
 * Usage:
 *   node build_resume.js <content.json> <out.docx>
 *
 * <content.json> supplies ONLY the tailored parts (bullets + skills). Every
 * other section (header, education, research and activities) is fixed here so
 * the layout, font, spacing and margins always match the master design.
 *
 * Content JSON shape:
 * {
 *   "sanofi_bullets":      ["...", ...],   // may contain **bold** markup
 *   "visualbuild_bullets": ["...", ...],
 *   "pulse_bullets":       ["...", ...],
 *   "skill_languages":  "a, b, c",         // may contain **bold** markup
 *   "skill_frameworks": "...",
 *   "skill_backend":    "...",
 *   "skill_tools":      "..."
 * }
 *
 * Formatting notes (docx library conventions):
 *   font size  = half-points        -> size: 21  means 10.5pt
 *   spacing    = twips (1440 = 1in) -> margin: 540 means 0.375in
 *   line: 212  = ~1.06x line height
 *
 * MUST STAY ONE PAGE. Keep bullet counts modest (the tailoring prompt caps
 * them at Sanofi 4 / VisualBuild 4 / TMU Pulse 3).
 * ------------------------------------------------------------------------- */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat,
  ExternalHyperlink, BorderStyle, TabStopType
} = require('docx');

const LINK = "0563C1";
const RULE = { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } };
const RIGHT = 10920;

// ---- read args ----
const contentPath = process.argv[2];
const outPath = process.argv[3];
if (!contentPath || !outPath) {
  console.error("Usage: node build_resume.js <content.json> <out.docx>");
  process.exit(1);
}
let content = {};
try {
  content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
} catch (e) {
  console.error("Failed to read content JSON:", e.message);
  process.exit(1);
}

// ---- helpers ----
const t = (text, opts = {}) => new TextRun({ text, size: 21, font: "Calibri", ...opts });
const b = (text) => new TextRun({ text, size: 21, font: "Calibri", bold: true });
const link = (text, url, opts = {}) => new ExternalHyperlink({
  link: url, children: [new TextRun({ text, size: 21, font: "Calibri", color: LINK, underline: {}, ...opts })],
});

// Normalize model text: drop em/en dashes, collapse whitespace.
function clean(s) {
  return String(s == null ? "" : s)
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse **bold** markup into an array of TextRun runs.
function runs(markup) {
  const parts = clean(markup).split(/\*\*/);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    out.push(i % 2 === 1 ? b(parts[i]) : t(parts[i]));
  }
  if (out.length === 0) out.push(t(""));
  return out;
}

function sectionHeader(text) {
  return new Paragraph({
    border: RULE, spacing: { before: 30, after: 10 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: "Calibri" })],
  });
}
function orgRow(left, right, before = 60) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 0, before },
    children: [b(left), new TextRun({ text: "\t" + right, bold: true, size: 21, font: "Calibri" })],
  });
}
function subRow(leftRuns, right, after = 30) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after },
    children: [...leftRuns, new TextRun({ text: "\t" + right, italics: true, size: 21, font: "Calibri" })],
  });
}
function bullet(bulletRuns) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 7, line: 212, lineRule: "auto" }, children: bulletRuns,
  });
}
function bulletFrom(markup) { return bullet(runs(markup)); }
function skillLine(label, restMarkup) {
  return new Paragraph({ spacing: { after: 12 }, children: [b(label + ": "), ...runs(restMarkup)] });
}

// Turn a list of markup strings into bullet paragraphs; tolerate empties.
function bulletList(items, fallback) {
  const list = Array.isArray(items) ? items.filter(x => clean(x) !== "") : [];
  const use = list.length ? list : (fallback || []);
  return use.map(bulletFrom);
}

// ---- pull tailored content (with safe fallbacks) ----
const sanofiBullets = bulletList(content.sanofi_bullets, [
  "Shipped full-stack features to Sanofi's company-wide AI platform.",
]);
const visualbuildBullets = bulletList(content.visualbuild_bullets, [
  "Built a multi-tenant AI SaaS for contractors; iOS app live on the App Store.",
]);
const pulseBullets = bulletList(content.pulse_bullets, [
  "Built a full-stack academic planning platform for university students.",
]);

const skillLanguages = content.skill_languages || "Python, C/C++, Java, TypeScript, JavaScript, SQL";
const skillFrameworks = content.skill_frameworks || "React, Next.js (App Router), React Native (Expo), Node.js, FastAPI, Tailwind CSS, React Query";
const skillBackend = content.skill_backend || "PostgreSQL, Supabase (Auth, Storage, RLS, Edge Functions), pgvector, REST APIs, ETL pipelines";
const skillTools = content.skill_tools || "AWS, Snowflake, Docker, CI/CD, Git/GitHub, Power BI, Jira, Confluence, Figma, Agile/Scrum";

const doc = new Document({
  numbering: { config: [{ reference: "bullets", levels: [{
    level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT,
    style: { run: { size: 14 }, paragraph: { indent: { left: 360, hanging: 200 } } },
  }] }] },
  styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 360, right: 540, bottom: 360, left: 540 } } },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 16 },
        children: [new TextRun({ text: "Nawaf Mahmood", bold: true, size: 32, font: "Calibri" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [
        t("Canadian Citizen | nawaf.mahmood2005@gmail.com | (416)-474-3996 | LinkedIn: "),
        link("Nawaf M", "https://www.linkedin.com/in/nawaf2005/"),
        t(" | GitHub: "), link("NawafM2005", "https://github.com/NawafM2005"),
      ] }),

      sectionHeader("Education"),
      orgRow("Toronto Metropolitan University", "Toronto, Canada", 20),
      subRow([new TextRun({ text: "B.S in Computer Science (Co-op) | ", italics: true, size: 21, font: "Calibri" }),
              new TextRun({ text: "CGPA: 4.10/4.33", italics: true, bold: true, size: 21, font: "Calibri" })],
              "Expected Graduation: May 2028", 26),
      bullet([b("Related Coursework: "), t("Data Structures & Algorithms, Object-Oriented Programming, Software Engineering, Operating Systems")]),
      bullet([b("Honours: "), t("Dean's List 2023-2026")]),

      sectionHeader("Technical Skills"),
      skillLine("Languages", skillLanguages),
      skillLine("Frameworks & Libraries", skillFrameworks),
      skillLine("Backend & Data", skillBackend),
      skillLine("Cloud & Tools", skillTools),

      sectionHeader("Experience"),
      orgRow("Sanofi", "Toronto, Canada", 20),
      subRow([new TextRun({ text: "Full-Stack Software Developer Intern | Teams: CX Data & AI, Data & AI Solutions", size: 21, font: "Calibri" })],
             "May 2026 - Present", 30),
      ...sanofiBullets,

      sectionHeader("Projects"),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 0, before: 20 }, children: [
        link("VisualBuild", "https://visualbuild.ca", { bold: true }), t("  |  "),
        link("iOS App Store", "https://apps.apple.com/us/app/visualbuild/id6770316632"),
      ] }),
      subRow([new TextRun({ text: "Next.js, TypeScript, Tailwind, Supabase, React Native (Expo), Gemini & OpenAI API", italics: true, size: 21, font: "Calibri" })],
             "April 2026 - Present", 30),
      ...visualbuildBullets,

      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 0, before: 60 }, children: [
        link("TMU Pulse", "https://tmupulse.ca", { bold: true }),
      ] }),
      subRow([new TextRun({ text: "Python, Next.js, TypeScript, PostgreSQL, Supabase, React, Tailwind CSS", italics: true, size: 21, font: "Calibri" })],
             "Jun 2025 - Present", 30),
      ...pulseBullets,

      sectionHeader("Research & Activities"),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 20 }, children: [
        b("Genome-Assembly Verification "), new TextRun({ text: "- Research with Prof. E. Harley, TMU", size: 21, font: "Calibri" }),
        new TextRun({ text: "\t2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      bullet([t("Built a "), b("genome-assembly pipeline"), t(" (Python, fastp, SPAdes, BLAST, minimap2) to verify a KanMX6 gene knockout in fission yeast across 6 sequencing pools, validated at "), b("99.8% identity"), t(" to the reference genome")]),
      bullet([t("Proved the target gene was "), b("not fully replaced"), t(" (coverage stayed near baseline vs. 0x expected) and traced a reproducible off-target integration to a second locus across both edited pools")]),

      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 12 }, children: [
        b("AWS Certified Solutions Architect - Associate (SAA-C03)"),
        new TextRun({ text: "\tIn Progress - Expected 2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 10 }, children: [
        b("RepPal "), new TextRun({ text: "- 1st Place, Sanofi x Snowflake Hackathon", size: 21, font: "Calibri" }),
        new TextRun({ text: "\t2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      bullet([t("Won "), b("1st place"), t(" with an AI recommendation system telling pharma reps which physicians to approach for consent under Canada's one-shot CASL law, backed by a consent-propensity model on Snowflake scoring "), b("~300K physicians"), t(" (0.85 AUC)")]),
      bullet([t("Built a sales-rep view (a web-enrichment agent feeding a personalized outreach strategy) and an admin view with analytics and a "), b("Snowflake Cortex"), t(" chatbot")]),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log("resume docx written:", outPath);
}).catch(err => {
  console.error("Failed to build resume docx:", err);
  process.exit(1);
});
