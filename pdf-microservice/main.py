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
    allow_origins=["*"], # In production, restrict this to your extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MarkdownPayload(BaseModel):
    markdown: str

@app.post("/generate-pdf")
async def generate_pdf(payload: MarkdownPayload):
    if not payload.markdown:
        raise HTTPException(status_code=400, detail="Markdown content is empty")

    # Create a temporary directory to handle file generation
    temp_dir = tempfile.mkdtemp()
    md_path = os.path.join(temp_dir, "input.md")
    pdf_path = os.path.join(temp_dir, "output.pdf")

    # Write the markdown payload to a file
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(payload.markdown)

    try:
        # Construct the Pandoc command. 
        # Using geometry for margins and specifying the xelatex engine for better font support.
        command = [
            "pandoc",
            md_path,
            "-o", pdf_path,
            "--pdf-engine=xelatex",
            "-V", "geometry:margin=1in",
            "-V", "mainfont=Helvetica", # Change to any gorgeous system font you prefer
            "--toc" # Generates a Table of Contents based on the ## headers
        ]
        
        subprocess.run(command, check=True, capture_output=True, text=True)

        # Return the generated PDF file. The browser will download it.
        return FileResponse(
            path=pdf_path, 
            filename="SmartNotes_Export.pdf", 
            media_type="application/pdf"
        )

    except subprocess.CalledProcessError as e:
        print(f"Pandoc Error: {e.stderr}")
        raise HTTPException(status_code=500, detail="Failed to compile LaTeX to PDF. Ensure Pandoc and TeX are installed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
