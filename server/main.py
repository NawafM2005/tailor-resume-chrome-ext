from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import time
import shutil
import subprocess
import tempfile
import base64
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    print("WARNING: OPENAI_API_KEY not found in environment variables.")
else:
    print("SUCCESS: OPENAI_API_KEY loaded.")

app = FastAPI(title="Resume Tailor API", version="2.0")

# Allow CORS for the extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to the extension ID
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory that holds resume_master.txt, the prompts and the generator/ scripts.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(BASE_DIR, "generator")
NODE_BIN = os.getenv("NODE_BIN", "node")
SOFFICE_BIN = os.getenv("SOFFICE_BIN", "soffice")


class TailorRequest(BaseModel):
    job_text: str
    # Primary control. One of: "both" | "resume" | "cover".
    mode: str | None = None
    # Legacy flag kept for backward compatibility with older extension builds.
    include_cover_letter: bool = False


# --------------------------------------------------------------------------- #
#  File + document helpers
# --------------------------------------------------------------------------- #
def read_server_file(name):
    with open(os.path.join(BASE_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


def run_node(script, content_obj, out_docx, workdir):
    """Render a .docx by handing the tailored content to a generator script."""
    content_path = os.path.join(workdir, "content.json")
    with open(content_path, "w", encoding="utf-8") as f:
        json.dump(content_obj, f)

    try:
        subprocess.run(
            [NODE_BIN, os.path.join(GEN_DIR, script), content_path, out_docx],
            check=True, capture_output=True, timeout=60, cwd=GEN_DIR,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{script} timed out")
    except subprocess.CalledProcessError as e:
        log = (e.stdout.decode(errors="ignore") + e.stderr.decode(errors="ignore"))
        raise RuntimeError(f"{script} failed: {log[-800:]}")

    if not os.path.exists(out_docx):
        raise RuntimeError(f"{script} did not produce a .docx")


def docx_to_pdf(docx_path, workdir):
    """Convert a .docx to PDF bytes using headless LibreOffice."""
    profile = os.path.join(workdir, "loprofile")
    try:
        subprocess.run(
            [SOFFICE_BIN, "--headless", "--nologo", "--nofirststartwizard",
             f"-env:UserInstallation=file://{profile}",
             "--convert-to", "pdf", "--outdir", workdir, docx_path],
            check=True, capture_output=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("PDF conversion timed out")
    except subprocess.CalledProcessError as e:
        log = (e.stdout.decode(errors="ignore") + e.stderr.decode(errors="ignore"))
        raise RuntimeError(f"PDF conversion failed: {log[-800:]}")

    pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
    if not os.path.exists(pdf_path):
        raise RuntimeError("PDF conversion produced no file")
    with open(pdf_path, "rb") as f:
        return f.read()


# --------------------------------------------------------------------------- #
#  OpenAI helper
# --------------------------------------------------------------------------- #
def call_openai_json(client, model, prompt, label, retries=2):
    """Call OpenAI expecting strict JSON, with a small retry loop."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs strict JSON."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )
            return json.loads(completion.choices[0].message.content)
        except Exception as e:  # network, rate limit, JSON decode, etc.
            last_err = e
            print(f"OpenAI attempt {attempt + 1} failed ({label}): {e}")
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"AI generation failed for {label}: {last_err}")


# --------------------------------------------------------------------------- #
#  Generation building blocks (each fully independent)
# --------------------------------------------------------------------------- #
def build_resume(client, model, job_text, master_resume):
    prompt_template = read_server_file("tailor_prompt.txt")
    full_prompt = (
        f"{prompt_template}\n\nJOB DESCRIPTION:\n{job_text}\n\nMASTER RESUME:\n{master_resume}"
    )
    data = call_openai_json(client, model, full_prompt, "resume")

    content = {
        "sanofi_bullets": data.get("sanofi_bullets", []),
        "visualbuild_bullets": data.get("visualbuild_bullets", []),
        "pulse_bullets": data.get("pulse_bullets", []),
        "skill_languages": data.get("skill_languages", ""),
        "skill_frameworks": data.get("skill_frameworks", ""),
        "skill_backend": data.get("skill_backend", ""),
        "skill_tools": data.get("skill_tools", ""),
    }

    with tempfile.TemporaryDirectory() as d:
        docx_path = os.path.join(d, "resume.docx")
        run_node("build_resume.js", content, docx_path, d)
        return docx_to_pdf(docx_path, d)


def build_cover_letter(client, model, job_text, master_resume):
    prompt_template = read_server_file("cover_letter_prompt.txt")
    full_prompt = (
        f"{prompt_template}\n\nJOB DESCRIPTION:\n{job_text}\n\nMASTER RESUME:\n{master_resume}"
    )
    data = call_openai_json(client, model, full_prompt, "cover_letter")

    company_name = data.get("company_name", "Hiring Team")
    content = {
        "company_name": company_name,
        "body_content": data.get("body_content", ""),
    }

    with tempfile.TemporaryDirectory() as d:
        docx_path = os.path.join(d, "cover_letter.docx")
        run_node("build_cover_letter.js", content, docx_path, d)
        return docx_to_pdf(docx_path, d), company_name


# --------------------------------------------------------------------------- #
#  Routes
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return {"service": "Resume Tailor API", "status": "ok"}


@app.get("/health")
def health_check():
    node_ok = shutil.which(NODE_BIN) is not None
    soffice_ok = shutil.which(SOFFICE_BIN) is not None
    return {
        "status": "ok",
        "node": node_ok,
        "libreoffice": soffice_ok,
        "openai_key": bool(os.getenv("OPENAI_API_KEY")),
    }


@app.post("/tailor")
async def tailor_resume(request: TailorRequest):
    print("Received tailoring request")

    if not request.job_text or not request.job_text.strip():
        raise HTTPException(status_code=400, detail="job_text is required")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    # Resolve what to generate. Prefer explicit `mode`; fall back to legacy flag.
    mode = (request.mode or "").strip().lower()
    if mode not in ("both", "resume", "cover"):
        mode = "both" if request.include_cover_letter else "resume"

    want_resume = mode in ("both", "resume")
    want_cover = mode in ("both", "cover")

    client = OpenAI(api_key=api_key, timeout=90.0, max_retries=2)
    model = os.getenv("MODEL", "gpt-4o")

    try:
        master_resume = read_server_file("resume_master.txt")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Server files missing (resume_master.txt)")

    resume_b64 = None
    cover_b64 = None
    company_name = None
    errors = {"resume": None, "cover_letter": None}

    # --- Resume (independent) ---
    if want_resume:
        try:
            resume_pdf = build_resume(client, model, request.job_text, master_resume)
            resume_b64 = base64.b64encode(resume_pdf).decode("utf-8")
            print("Resume generated OK")
        except Exception as e:
            errors["resume"] = str(e)
            print(f"Resume generation failed: {e}")

    # --- Cover letter (independent) ---
    if want_cover:
        try:
            cover_pdf, company_name = build_cover_letter(
                client, model, request.job_text, master_resume
            )
            cover_b64 = base64.b64encode(cover_pdf).decode("utf-8")
            print("Cover letter generated OK")
        except Exception as e:
            errors["cover_letter"] = str(e)
            print(f"Cover letter generation failed: {e}")

    # If everything that was requested failed, surface a 500 so the client
    # shows a clear error instead of an empty success.
    produced_anything = (want_resume and resume_b64) or (want_cover and cover_b64)
    if not produced_anything:
        detail = "; ".join(v for v in errors.values() if v) or "Generation failed"
        raise HTTPException(status_code=500, detail=detail)

    return {
        "resume": resume_b64,
        "cover_letter": cover_b64,
        "company_name": company_name,
        "errors": errors,
    }
