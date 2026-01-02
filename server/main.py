from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import subprocess
import tempfile
import shutil
import re
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Debug: Check if key is loaded
if not os.getenv("OPENAI_API_KEY"):
    print("WARNING: OPENAI_API_KEY not found in environment variables.")
else:
    print("SUCCESS: OPENAI_API_KEY loaded.")

app = FastAPI()

# Allow CORS for the extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TailorRequest(BaseModel):
    job_text: str

def escape_latex(text):
    """
    Escapes special characters for LaTeX.
    """
    if not isinstance(text, str):
        return str(text)
    
    chars = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
        '\\': r'\textbackslash{}',
    }
    pattern = re.compile('|'.join(re.escape(key) for key in chars.keys()))
    return pattern.sub(lambda x: chars[x.group()], text)

def format_latex_content(text):
    """
    Escapes LaTeX special chars and converts **bold** to \textbf{bold}.
    """
    # 1. Escape special characters first
    escaped = escape_latex(text)
    
    # 2. Convert **text** to \textbf{text}
    # We use a regex that looks for **...**
    # Note: escape_latex does not escape *, so ** remains **
    bolded = re.sub(r'\*\*(.*?)\*\*', r'\\textbf{\1}', escaped)
    
    return bolded

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/tailor")
async def tailor_resume(request: TailorRequest):
    print("📥 Received tailoring request")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
    
    client = OpenAI(api_key=api_key)
    model = os.getenv("MODEL", "gpt-4o")

    # 1. Read Master Resume & Prompt
    print("📄 Reading template files...")
    try:
        with open("resume_master.txt", "r") as f:
            master_resume = f.read()
        with open("tailor_prompt.txt", "r") as f:
            prompt_template = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Server files missing")

    # 2. Call OpenAI
    print("🤖 Calling OpenAI API (this may take 5-20 seconds)...")
    full_prompt = f"{prompt_template}\n\nJOB DESCRIPTION:\n{request.job_text}\n\nMASTER RESUME:\n{master_resume}"
    
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs strict JSON."},
                {"role": "user", "content": full_prompt}
            ],
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        tailored_data = json.loads(content)
        print("✅ OpenAI response received")
    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")

    # 3. Validate & Format Data
    pulse_bullets = tailored_data.get("pulse_bullets", [])
    lectra_bullets = tailored_data.get("lectra_bullets", [])
    
    skill_languages = tailored_data.get("skill_languages", "")
    skill_frameworks = tailored_data.get("skill_frameworks", "")
    skill_tools = tailored_data.get("skill_tools", "")

    # Format bullets as LaTeX items
    formatted_pulse = "\n    ".join([f"\\item {format_latex_content(b)}" for b in pulse_bullets])
    formatted_lectra = "\n    ".join([f"\\item {format_latex_content(b)}" for b in lectra_bullets])
    
    # Format skills into 3 lines
    # The template has \item %%SKILLS_SECTION%%, so we start with the content of the first item
    formatted_skills = (
        f"\\textbf{{Languages:}} {format_latex_content(skill_languages)}"
        f"\n    \\item \\textbf{{Frameworks \\& Platforms:}} {format_latex_content(skill_frameworks)}"
        f"\n    \\item \\textbf{{Practices \\& Tools:}} {format_latex_content(skill_tools)}"
    )

    # 4. Read Template and Inject Content
    try:
        with open("resume_template.tex", "r") as f:
            latex_template = f.read()
            
        filled_latex = latex_template.replace("%%PROJECT_PULSE_BULLETS%%", formatted_pulse)
        filled_latex = filled_latex.replace("%%PROJECT_LECTRA_BULLETS%%", formatted_lectra)
        filled_latex = filled_latex.replace("%%SKILLS_SECTION%%", formatted_skills)
        
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Template missing")

    # 5. Compile LaTeX to PDF
    print("📝 Compiling LaTeX to PDF...")
    with tempfile.TemporaryDirectory() as temp_dir:
        tex_path = os.path.join(temp_dir, "resume.tex")
        pdf_path = os.path.join(temp_dir, "resume.pdf")
        
        with open(tex_path, "w") as f:
            f.write(filled_latex)
            
        # Run pdflatex twice to ensure layout is correct
        try:
            for i in range(2):
                print(f"  Running pdflatex (pass {i+1}/2)...")
                subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-output-directory", temp_dir, tex_path],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
        except subprocess.CalledProcessError as e:
            print(f"LaTeX Error: {e.stdout.decode()} {e.stderr.decode()}")
            raise HTTPException(status_code=500, detail="LaTeX compilation failed")
            
        if not os.path.exists(pdf_path):
             raise HTTPException(status_code=500, detail="PDF not generated")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    print(f"✅ PDF generated successfully ({len(pdf_bytes)} bytes)")
    return Response(content=pdf_bytes, media_type="application/pdf")
