/* ---------------------------------------------------------------------------
 * Nawaf Mahmood - resume generator (server pipeline version)
 *
 * Usage:
 *   node build_resume.js <content.json> <out.docx>
 *
 * The resume bullets are FIXED here (identical to the master resume PDF). The
 * ONLY tailored part is the Technical Skills section: the model reorders the
 * real skills to surface the most job-relevant ones and appends "(interest)"
 * items for job technologies that are not already on the resume. Any heavier,
 * job-specific rephrasing belongs in the cover letter, not here.
 *
 * Content JSON shape (all optional; sensible defaults below):
 * {
 *   "skill_languages":  "a, b, c",
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
 * MUST STAY ONE PAGE.
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
  if (contentPath && fs.existsSync(contentPath)) {
    content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  }
} catch (e) {
  console.error("Failed to read content JSON, using defaults:", e.message);
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

// ---- FIXED resume bullets (bold matches the master resume PDF) ----
const SANOFI = [
  "Shipped **full-stack features** to **Newton (Talk to Data)**, Sanofi's company-wide AI platform, including a **prompt library**, a **chart-widget dashboard**, and **Microsoft Graph** integration for access groups",
  "Led **TraceReview** end-to-end (planning, development, testing) with a 3-intern team, an **agent-observability tool** (**React**, **Python**) tracing **15+ Snowflake AI agents**, surfacing reasoning, SQL queries, results, and charts in one view",
  "Architected it as a **general-purpose platform** for **any AI agent across Sanofi**; already adopted by a **second org beyond Newton** to trace their own agents",
  "Built **automated ETL pipelines** for the **CX Data & AI team**, unifying **15+ sources** (**SharePoint**, **Google Analytics**, internal systems) into one **database** powering **React / Power BI dashboards**",
];
const VISUALBUILD = [
  "A **multi-tenant AI SaaS** for contractors that turns one property photo into a photorealistic renovation preview in **~30 seconds** across **21 categories**, replacing a **$200+, multi-day** designer render; **iOS app live on the App Store**",
  "Integrated **Gemini and OpenAI APIs** for image generation and **Stripe** for subscription billing, processing **500+ renders** with a **backup-model fallback** that keeps generation success near **100%** when a provider is overloaded",
  "Architected a **server-side-only AI pipeline** so API keys never reach the client and model changes deploy without a mobile redeploy, with a render flow that survives client disconnects and resurfaces jobs on refetch",
  "Designed an isolated **multi-tenant Postgres schema** with **Row-Level Security** on every table plus **JWT bearer-token auth** shared across web and iOS, guaranteeing businesses can never access each other's data",
  "Built an **address-to-render pipeline** on the Google Places and Street View APIs (preview from an address, no upload) and shipped the full surface with **Vitest** + **Playwright** tests",
];
const PULSE = [
  "A **full-stack academic planning platform** for university students that unifies GPA tracking, schedule building, course discovery, and degree planning, serving **1,000+ active students** and **30,000+ visits** at **~100 daily**",
  "Engineered a modular architecture spanning a course catalogue, GPA tracker, degree planner, transcript analyzer, and **Rate My Professors** integration, with **automated rating and course-data aggregation**",
  "Built a Python and PostgreSQL data pipeline processing **3,700+ course records** across **100+ departments**, with scraping, normalization, and indexing that hold **sub-second load times** at scale",
];

// ---- Skills: tailored (values from JSON) with fixed fallbacks ----
const skillLanguages = clean(content.skill_languages) || "Python, C/C++, Java, TypeScript, JavaScript, SQL";
const skillFrameworks = clean(content.skill_frameworks) || "React, Next.js (App Router), React Native (Expo), Node.js, FastAPI, Tailwind CSS, React Query";
const skillBackend = clean(content.skill_backend) || "PostgreSQL, Supabase (Auth, Storage, RLS, Edge Functions), pgvector, REST APIs, ETL pipelines";
const skillTools = clean(content.skill_tools) || "AWS, Snowflake, Docker, CI/CD, Git/GitHub, Power BI, Jira, Confluence, Figma, Agile/Scrum";

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
      bullet([b("Honours: "), t("Dean's List 2023–2026")]),

      sectionHeader("Technical Skills"),
      skillLine("Languages", skillLanguages),
      skillLine("Frameworks & Libraries", skillFrameworks),
      skillLine("Backend & Data", skillBackend),
      skillLine("Cloud & Tools", skillTools),

      sectionHeader("Experience"),
      orgRow("Sanofi", "Toronto, Canada", 20),
      subRow([new TextRun({ text: "Full-Stack Software Developer Intern | Teams: CX Data & AI, Data & AI Solutions", size: 21, font: "Calibri" })],
             "May 2026 - Present", 30),
      ...SANOFI.map(bulletFrom),

      sectionHeader("Projects"),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 0, before: 20 }, children: [
        link("VisualBuild", "https://visualbuild.ca", { bold: true }), t("  |  "),
        link("iOS App Store", "https://apps.apple.com/us/app/visualbuild/id6770316632"),
      ] }),
      subRow([new TextRun({ text: "Next.js, TypeScript, Tailwind, Supabase, React Native (Expo), Gemini & OpenAI API", italics: true, size: 21, font: "Calibri" })],
             "April 2026 - Present", 30),
      ...VISUALBUILD.map(bulletFrom),

      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 0, before: 60 }, children: [
        link("TMU Pulse", "https://tmupulse.ca", { bold: true }),
      ] }),
      subRow([new TextRun({ text: "Python, Next.js, TypeScript, PostgreSQL, Supabase, React, Tailwind CSS", italics: true, size: 21, font: "Calibri" })],
             "Jun 2025 - Present", 30),
      ...PULSE.map(bulletFrom),

      sectionHeader("Research & Activities"),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 20 }, children: [
        b("Genome-Assembly Verification "), new TextRun({ text: "- Research with Prof. E. Harley, TMU", size: 21, font: "Calibri" }),
        new TextRun({ text: "\t2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      bullet([t("Built a "), b("genome-assembly pipeline"), t(" ("), b("Python"), t(", fastp, SPAdes, BLAST, minimap2) to verify a "), b("KanMX6 gene knockout"), t(" in fission yeast across "), b("6 sequencing pools"), t(", validated at "), b("99.8% identity"), t(" to the reference genome")]),
      bullet([t("Proved the target gene was "), b("not fully replaced"), t(" (coverage stayed near baseline vs. 0× expected) and traced a "), b("reproducible off-target integration"), t(" to a second locus across both edited pools")]),

      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 12 }, children: [
        b("AWS Certified Solutions Architect - Associate (SAA-C03)"),
        new TextRun({ text: "\tIn Progress - Expected 2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 10, before: 10 }, children: [
        b("RepPal "), new TextRun({ text: "- 1st Place, Sanofi x Snowflake Hackathon", size: 21, font: "Calibri" }),
        new TextRun({ text: "\t2026", italics: true, size: 21, font: "Calibri" }),
      ] }),
      bullet([t("Won "), b("1st place"), t(" with an "), b("AI recommendation system"), t(" telling pharma reps which physicians to approach for consent under Canada's one-shot "), b("CASL"), t(" law, backed by a "), b("consent-propensity model on Snowflake"), t(" scoring "), b("~300K physicians"), t(" ("), b("0.85 AUC"), t(")")]),
      bullet([t("Built a "), b("sales-rep view"), t(" (a "), b("web-enrichment agent"), t(" feeding a "), b("personalized outreach strategy"), t(") and an "), b("admin view"), t(" with analytics and a "), b("Snowflake Cortex"), t(" chatbot")]),
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
