# main.py
import os
import subprocess
import tempfile
import base64
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SmartNotes Backend API")

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

class ImagePayload(BaseModel):
    prompt: str
    account_id: str
    api_token: str

@app.post("/generate-image")
async def generate_image(payload: ImagePayload):
    if not payload.prompt or not payload.account_id or not payload.api_token:
        raise HTTPException(status_code=400, detail="Missing required parameters")
        
    url = f"https://api.cloudflare.com/client/v4/accounts/{payload.account_id}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0"
    headers = {"Authorization": f"Bearer {payload.api_token}"}
    cf_payload = {"prompt": payload.prompt}
    
    try:
        response = requests.post(url, headers=headers, json=cf_payload)
        response.raise_for_status()
        
        # Convert raw Cloudflare image bytes to Base64 for the browser
        img_b64 = base64.b64encode(response.content).decode('utf-8')
        return {"image_base64": img_b64}
        
    except requests.exceptions.RequestException as e:
        print(f"Cloudflare Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")


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
        command = [
            "pandoc",
            input_path,
            "-f", "html",
            "-o", pdf_path,
            "--pdf-engine=xelatex",
            "-V", "geometry:margin=1in",
            "--toc" 
        ]
        
        subprocess.run(command, check=True, capture_output=True, text=True)

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
