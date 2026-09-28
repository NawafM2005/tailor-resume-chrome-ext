# Resume Tailor

A Chrome extension + FastAPI backend that tailors Nawaf's resume and cover letter
to any job description and downloads polished PDFs.

Given a job description, the backend keeps the resume bullets exactly as written
and tailors **only the Technical Skills section** (reordering the real skills for
relevance and adding job-specific technologies as `(interest)` items). It renders
the result to a `.docx` using the same design as `build-resume.js` and converts
it to PDF with headless LibreOffice. Heavier, job-specific narrative goes into the
cover letter, which is fully tailored.

## Structure

- `extension/` - Chrome extension (Manifest V3).
- `server/` - FastAPI backend.
  - `main.py` - API: calls the LLM, renders docx, converts to PDF.
  - `resume_master.txt` - the truth anchor (only facts the model may use).
  - `tailor_prompt.txt` / `cover_letter_prompt.txt` - LLM instructions.
  - `generator/` - Node scripts that build the `.docx` files (`docx` library).

## How it works

1. Extension sends the job description + a mode (`both` / `resume` / `cover`).
2. Backend calls the LLM for the tailored **Skills** lines (resume) and/or a
   cover letter body, as strict JSON. Resume bullets are fixed in the generator.
3. `generator/build_resume.js` / `build_cover_letter.js` render `.docx` files
   with the master design (Calibri, fixed margins/spacing, one page).
4. Headless LibreOffice converts each `.docx` to PDF.
5. Resume and cover letter are generated **independently** - if one fails the
   other still downloads.

## Setup

### Backend (Docker - recommended)
The backend needs Node, LibreOffice and the Carlito font, so Docker is easiest:

```bash
docker build -t resume-tailor .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... resume-tailor
```

### Backend (local, without Docker)
Requires: Python 3.11+, Node 18+, LibreOffice (`soffice` on PATH), and a
Calibri-compatible font (`fonts-crosextra-carlito` on Linux).

1. `cd server`
2. `python -m venv venv && source venv/bin/activate`
3. `pip install -r requirements.txt`
4. `cd generator && npm install && cd ..`
5. Create `.env` with `OPENAI_API_KEY=...` (optionally `MODEL=gpt-4o`).
6. `uvicorn main:app --reload`

Check `GET /health` - it reports whether Node, LibreOffice and the API key are
detected.

### Extension
1. Open `chrome://extensions/` and enable "Developer mode".
2. "Load unpacked" -> select the `extension/` folder.
3. If the backend runs somewhere other than the deployed Render URL, update
   `API_URL` in `extension/background.js` (and `host_permissions` in
   `manifest.json`).

## Usage
1. Open a job posting (or copy the description).
2. Click the extension icon.
3. Click **Get Page Text** (or paste the description).
4. Choose **Both**, **Resume**, or **Cover**.
5. Click **Generate**. PDFs download automatically with fixed names
   (`Nawaf_Mahmood_Resume.pdf`, `Nawaf_Mahmood_Cover_Letter.pdf`), overwriting
   the previous versions.

## Reliability notes
- The extension retries transient network / cold-start errors (Render free tier
  can take ~30-60s to wake) with a long timeout, and surfaces clear errors.
- Work runs in the background service worker, so it survives the popup closing;
  the last run's outcome is restored when you reopen the popup.
- Resume and cover letter fail independently.

## Content integrity
- Resume experience/project bullets are **fixed** (identical to the master PDF);
  the model never rewrites them.
- Tailoring is limited to the Technical Skills section: real skills are only
  reordered (never dropped), and job technologies not already on the resume may
  be added as `(interest)` items (max 5).
- The cover letter (which uses the full `resume_master.txt` facts) is where
  job-specific rephrasing happens; it still preserves every metric exactly and
  never invents experience.
