# 🧠 SmartNotes Pro: AI-Powered Contextual Workspace & LaTeX Compiler

SmartNotes Pro is a next-generation browser extension and dedicated rendering engine that transforms web content, YouTube lectures, and scattered articles into gorgeous, textbook-quality PDF notes. 

Built for high-performance learners, developers, and researchers, SmartNotes Pro doesn't just summarize—it analyzes context, captures precise visual timestamps, and compiles perfectly formatted LaTeX documents on the fly.

## 🔥 Elite Features

* **Adaptive AI Learning Modes:**
  * 🎯 **Exam Prep:** Extracts high-yield formulas, PYQs, and fast-revision bullet points.
  * 💡 **Skill Gain:** Builds intuition with step-by-step logic, code progressions, and practical analogies.
  * 🔬 **Research:** Dives into theoretical nuances, historical context, and critical edge cases.
* **Continuous Rolling Context:** Our optimized 5-minute chunking algorithm ensures the LLM never loses the plot. It seamlessly stitches long lectures together without redundant "clumping" or amnesia.
* **Precision Timestamp & Diagram Capture:** Snap a frame from a video, and the extension automatically injects the exact timestamp and visual context into your notes.
* **Context-Aware Inline Editing:** Highlight a specific paragraph and tell the AI to "make it perfect." The engine reads the surrounding paragraphs to ensure the rewritten text flawlessly matches your document's tone and structure.
* **Dedicated LaTeX Rendering Engine:** Bypasses clunky browser PDF printers. Your notes are fired to a standalone microservice, compiled through professional LaTeX templates, and returned as a gorgeous, publication-ready PDF.
* **Bring Your Own Key (BYOK):** Zero hidden subscription fees. Securely plug in your own LLM API key directly into local browser storage.

## 🚀 Architecture overview

This system is decoupled for maximum performance:
1. **The Client (Browser Extension):** A lightweight, zero-dependency extension that handles UI, video scraping, API key management, and LLM orchestration.
2. **The Compiler (Python Microservice):** A standalone API that ingests raw Markdown, processes it via Pandoc/LaTeX, and returns a compiled PDF.

## 🛠️ Installation & Setup

### Part 1: Load the Extension (No Backend Required for Generation)
1. Download `smartnotes-extension.zip` from the Releases tab and extract it.
2. Open Chrome/Edge/Brave and navigate to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. Click the extension icon, paste your API key, and select your Learning Mode!

### Part 2: Run the LaTeX Microservice (For PDF Exports)
*Requires Python 3.8+ and Pandoc/TexLive installed on your host machine.*
```bash
cd pdf-microservice
pip install fastapi uvicorn pydantic
uvicorn main:app --reload