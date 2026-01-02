from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import subprocess
import tempfile
import shutil
import re
import zipfile
import io
import base64
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
    include_cover_letter: bool = False

def escape_latex(text):
    """
    Escapes special characters for LaTeX.
    """
    if not isinstance(text, str):
        return str(text)
    
    chars = {
        '&': r'\&',
        '%': r'\%',
        '$': r'$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
        '\': r'\textbackslash{}',
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
    bolded = re.sub(r'\*\*(.*?)\*\*', r'\textbf{\1}', escaped)
    
    return bolded

def compile_latex(latex_content, filename="document"):
    """
    Compiles LaTeX content to PDF bytes.
    """
    print(f"📝 Compiling LaTeX to PDF ({filename})...")
    with tempfile.TemporaryDirectory() as temp_dir:
        tex_path = os.path.join(temp_dir, f"{filename}.tex")
        pdf_path = os.path.join(temp_dir, f"{filename}.pdf")
        
        with open(tex_path, "w") as f:
            f.write(latex_content)
            
        # Run pdflatex twice to ensure layout is correct
        try:
            for i in range(2):
                # print(f"  Running pdflatex (pass {i+1}/2)...")
                subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-output-directory", temp_dir, tex_path],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
        except subprocess.CalledProcessError as e:
            print(f"LaTeX Error: {e.stdout.decode()} {e.stderr.decode()}")
            raise HTTPException(status_code=500, detail=f"LaTeX compilation failed for {filename}")
            
        if not os.path.exists(pdf_path):
             raise HTTPException(status_code=500, detail=f"PDF not generated for {filename}")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
            
    return pdf_bytes

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

    # 1. Read Master Resume & Prompts
    print("📄 Reading template files...")
    try:
        with open("resume_master.txt", "r") as f:
            master_resume = f.read()
        with open("tailor_prompt.txt", "r") as f:
            resume_prompt_template = f.read()
        
        cover_letter_prompt_template = ""
        if request.include_cover_letter:
            with open("cover_letter_prompt.txt", "r") as f:
                cover_letter_prompt_template = f.read()
                
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Server files missing")

    # 2. Call OpenAI for Resume
    print("🤖 Calling OpenAI API for Resume...")
    resume_full_prompt = f"{resume_prompt_template}\n\nJOB DESCRIPTION:\n{request.job_text}\n\nMASTER RESUME:\n{master_resume}"
    
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs strict JSON."},
                {"role": "user", "content": resume_full_prompt}
            ],
            response_format={"type": "json_object"}
        )
        resume_content = completion.choices[0].message.content
        resume_data = json.loads(resume_content)
        print("✅ OpenAI response received for Resume")
    except Exception as e:
        print(f"OpenAI Error (Resume): {e}")
        raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")

    # 3. Process Resume Data
    pulse_bullets = resume_data.get("pulse_bullets", [])
    lectra_bullets = resume_data.get("lectra_bullets", [])
    
    skill_languages = resume_data.get("skill_languages", "")
    skill_frameworks = resume_data.get("skill_frameworks", "")
    skill_tools = resume_data.get("skill_tools", "")

    formatted_pulse = "\n    ".join([f"\item {format_latex_content(b)}" for b in pulse_bullets])
    formatted_lectra = "\n    ".join([f"\item {format_latex_content(b)}" for b in lectra_bullets])
    
    formatted_skills = (
        f"\textbf{{Languages:}} {format_latex_content(skill_languages)}"
        f"\n    \item \textbf{{Frameworks \& Platforms:}} {format_latex_content(skill_frameworks)}"
        f"\n    \item \textbf{{Practices \& Tools:}} {format_latex_content(skill_tools)}"
    )

    # 4. Fill Resume Template
    try:
        with open("resume_template.tex", "r") as f:
            resume_latex_template = f.read()
            
        filled_resume_latex = resume_latex_template.replace("%%PROJECT_PULSE_BULLETS%%", formatted_pulse)
        filled_resume_latex = filled_resume_latex.replace("%%PROJECT_LECTRA_BULLETS%%", formatted_lectra)
        filled_resume_latex = filled_resume_latex.replace("%%SKILLS_SECTION%%", formatted_skills)
        
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Resume template missing")

    # 5. Compile Resume PDF
    resume_pdf_bytes = compile_latex(filled_resume_latex, "resume")

    # 6. Handle Cover Letter (if requested)
    if request.include_cover_letter:
        print("🤖 Calling OpenAI API for Cover Letter...")
        cl_full_prompt = f"{cover_letter_prompt_template}\n\nJOB DESCRIPTION:\n{request.job_text}\n\nMASTER RESUME:\n{master_resume}"
        
        try:
            cl_completion = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs strict JSON."},
                    {"role": "user", "content": cl_full_prompt}
                ],
                response_format={"type": "json_object"}
            )
            cl_content = cl_completion.choices[0].message.content
            cl_data = json.loads(cl_content)
            print("✅ OpenAI response received for Cover Letter")
        except Exception as e:
            print(f"OpenAI Error (Cover Letter): {e}")
            # We can choose to fail hard or just skip the cover letter. Let's fail hard for now.
            raise HTTPException(status_code=500, detail=f"AI Generation failed for Cover Letter: {str(e)}")
            
        company_name = cl_data.get("company_name", "Hiring Team")
        body_content = cl_data.get("body_content", "")
        
        # Format body content (escape latex)
        # Note: The prompt asks for LaTeX-safe text, but we should double check or just escape it if it's plain text.
        # The prompt says "escape special characters... or I will handle it in code". Let's handle it to be safe.
        # But we also want to preserve paragraphs.
        
        # Split by double newlines to preserve paragraphs
        paragraphs = body_content.split("\n\n")
        formatted_paragraphs = [format_latex_content(p.strip()) for p in paragraphs if p.strip()]
        formatted_body = "\n\n".join(formatted_paragraphs)
        
        formatted_company = format_latex_content(company_name)

        try:
            with open("cover_letter_template.tex", "r") as f:
                cl_latex_template = f.read()
            
            filled_cl_latex = cl_latex_template.replace("VAR_COMPANY_NAME", formatted_company)
            filled_cl_latex = filled_cl_latex.replace("VAR_BODY_CONTENT", formatted_body)
            
        except FileNotFoundError:
             raise HTTPException(status_code=500, detail="Cover Letter template missing")
             
        cl_pdf_bytes = compile_latex(filled_cl_latex, "cover_letter")
        
        # Return JSON with both PDFs
        print("📦 Encoding PDFs to Base64...")
        resume_b64 = base64.b64encode(resume_pdf_bytes).decode('utf-8')
        cl_b64 = base64.b64encode(cl_pdf_bytes).decode('utf-8')
        
        return {
            "resume": resume_b64,
            "cover_letter": cl_b64
        }

    # Return just the resume PDF (as JSON for consistency)
    print(f"✅ PDF generated successfully ({len(resume_pdf_bytes)} bytes)")
    resume_b64 = base64.b64encode(resume_pdf_bytes).decode('utf-8')
    return {
        "resume": resume_b64,
        "cover_letter": None
    }
