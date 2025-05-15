from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel # Added for request body model
import os
import pdfplumber # Added for PDF processing
from typing import List

UPLOAD_DIR = "uploaded_files"
EXTRACTED_DIR = "extracted"
STATIC_DIR = "static"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXTRACTED_DIR, exist_ok=True)

app = FastAPI()

# Model for the save markdown request body
class MarkdownSaveRequest(BaseModel):
    markdown: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", response_class=HTMLResponse)
def root():
    with open(os.path.join(STATIC_DIR, "index.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_location = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_location, "wb") as f:
        f.write(await file.read())
    return {"filename": file.filename}

@app.get("/files")
def list_files() -> List[str]:
    return os.listdir(UPLOAD_DIR)

@app.get("/file/{filename}")
def get_file(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

@app.post("/extract/{filename}")
def extract_pdf_text(filename: str):
    pdf_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    file_base, _ = os.path.splitext(filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    os.makedirs(output_dir_for_file, exist_ok=True)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            num_pages = len(pdf.pages)
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                # Ensure text is not None before writing
                page_md_filename = f"page_{i + 1}.md"
                with open(os.path.join(output_dir_for_file, page_md_filename), "w", encoding="utf-8") as f:
                    f.write(text or "") # Write empty string if text is None
            return JSONResponse(content={"status": "Extraction complete", "filename": filename, "pages_processed": num_pages})
    except Exception as e:
        # Log the exception for server-side debugging
        print(f"Error during PDF extraction for {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Error during PDF extraction: {str(e)}")

@app.get("/extracted-markdown/{filename}/{page_num}")
def get_extracted_markdown(filename: str, page_num: int):
    file_base, _ = os.path.splitext(filename)
    page_md_path = os.path.join(EXTRACTED_DIR, file_base, f"page_{page_num}.md")

    if not os.path.exists(page_md_path):
        # If specific page not found, maybe it was blank or extraction is pending
        # For now, return empty or a specific message
        return JSONResponse(content={"filename": filename, "page": page_num, "markdown": ""}, status_code=200)
        # Or raise HTTPException(status_code=404, detail=f"Extracted markdown for page {page_num} of {filename} not found.")

    with open(page_md_path, "r", encoding="utf-8") as f:
        markdown_content = f.read()
    return JSONResponse(content={"filename": filename, "page": page_num, "markdown": markdown_content})

@app.post("/save-markdown/{filename}/{page_num}")
def save_edited_markdown(filename: str, page_num: int, request_data: MarkdownSaveRequest):
    file_base, _ = os.path.splitext(filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    os.makedirs(output_dir_for_file, exist_ok=True) # Ensure directory exists
    
    page_md_path = os.path.join(output_dir_for_file, f"page_{page_num}.md")

    try:
        with open(page_md_path, "w", encoding="utf-8") as f:
            f.write(request_data.markdown)
        return JSONResponse(content={"status": "success", "message": f"Page {page_num} of {filename} saved."}, status_code=200)
    except Exception as e:
        print(f"Error saving markdown for {filename}, page {page_num}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save markdown: {str(e)}") 