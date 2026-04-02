# main.py
import os
import subprocess
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SmartNotes LaTeX PDF Compiler")

# Allow the browser extension to make requests to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MarkdownPayload(BaseModel):
    markdown: str

@app.post("/generate-pdf")
async def generate_pdf(payload: MarkdownPayload):
    if not payload.markdown:
        raise HTTPException(status_code=400, detail="Content is empty")

    temp_dir = tempfile.mkdtemp()
    input_path = os.path.join(temp_dir, "input.html")
    pdf_path = os.path.join(temp_dir, "output.pdf")

    # Write the payload (HTML from editor.innerHTML) to a file
    with open(input_path, "w", encoding="utf-8") as f:
        f.write(payload.markdown)

    try:
        # Tell Pandoc it is reading an HTML file with the '-f html' flag
        command = [
            "pandoc",
            input_path,
            "-f", "html",
            "-o", pdf_path,
            "--pdf-engine=xelatex",
            "-V", "geometry:margin=1in",
            "-V", "mainfont=Helvetica", 
            "--toc" 
        ]
        
        process = subprocess.run(command, check=True, capture_output=True, text=True)

        return FileResponse(
            path=pdf_path, 
            filename="SmartNotes_Export.pdf", 
            media_type="application/pdf"
        )

    except subprocess.CalledProcessError as e:
        print(f"Pandoc Error: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Pandoc compilation failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))