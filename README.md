# Resume Tailor

A Chrome extension and FastAPI backend to tailor your resume for specific job descriptions.

## Structure

- `extension/`: Chrome extension source code.
- `server/`: Python FastAPI backend.

## Setup

### Backend
1. Navigate to `server/`.
2. Create a virtual environment: `python -m venv venv`.
3. Activate it: `source venv/bin/activate` (Mac/Linux) or `venv\Scripts\activate` (Windows).
4. Install dependencies: `pip install -r requirements.txt`.
5. Copy `.env.example` to `.env` in the root (or server folder depending on where you run it) and fill in your keys.
6. Run the server: `uvicorn main:app --reload`.

### Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `extension/` folder.

## Usage
1. Navigate to a job posting.
2. Click the extension icon.
3. Click "Get this page" to extract text.
4. Edit the text if needed.
5. Click "Generate PDF".
6. The tailored PDF will download automatically.

## Troubleshooting
- **Secret Mismatch**: Ensure `EXTENSION_SECRET` in `.env` matches the key sent by the extension (currently hardcoded in `background.js` skeleton).
- **Empty Extraction**: If "Get this page" fails, manually copy-paste the job description.
- **LaTeX Failures**: Ensure `pdflatex` is installed and in your system PATH if you implement the compilation step.
