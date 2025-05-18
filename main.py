from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel # Added for request body model
import os
import pdfplumber # Added for PDF processing
import fitz # PyMuPDF
from typing import List, Optional # Added Optional

UPLOAD_DIR = "uploaded_files"
EXTRACTED_DIR = "extracted"
STATIC_DIR = "static"
BATCH_SIZE = 5 # Number of pages to extract in one go

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXTRACTED_DIR, exist_ok=True)

app = FastAPI()

# Model for the save content request body
class ContentSaveRequest(BaseModel):
    content: str # Changed from markdown

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
    # Clear any old extracted content for this file if re-uploaded
    file_base, _ = os.path.splitext(file.filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    if os.path.exists(output_dir_for_file):
        for item in os.listdir(output_dir_for_file):
            os.remove(os.path.join(output_dir_for_file, item))
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
def extract_pdf_text(filename: str, page_hint: Optional[int] = Query(1)):
    pdf_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    file_base, _ = os.path.splitext(filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    os.makedirs(output_dir_for_file, exist_ok=True)
    doc = None # Initialize doc to None
    try:
        doc = fitz.open(pdf_path) # Use PyMuPDF
        total_pages_in_pdf = len(doc)
        if page_hint > total_pages_in_pdf:
            page_hint = total_pages_in_pdf
        
        highest_extracted = 0
        for i in range(1, total_pages_in_pdf + 1):
            # Check for .html files now
            if os.path.exists(os.path.join(output_dir_for_file, f"page_{i}.html")):
                highest_extracted = i
            else:
                break

        start_page_for_batch = highest_extracted + 1
        if page_hint > highest_extracted:
            start_page_for_batch = page_hint 
        
        if start_page_for_batch > total_pages_in_pdf:
            doc.close()
            return JSONResponse(content={
                "status": "All pages already processed or requested page out of bounds.",
                "filename": filename,
                "totalPages": total_pages_in_pdf,
                "lastPageExtractedInBatch": highest_extracted,
                "isProcessingComplete": True,
                "contentType": "html"
            })

        end_page_for_batch = min(start_page_for_batch + BATCH_SIZE - 1, total_pages_in_pdf)
        pages_processed_this_call = 0
        last_page_actually_extracted = highest_extracted

        for i in range(start_page_for_batch, end_page_for_batch + 1):
            page_html_path = os.path.join(output_dir_for_file, f"page_{i}.html")
            if not os.path.exists(page_html_path):
                page = doc.load_page(i-1) # PyMuPDF pages are 0-indexed
                html_content = page.get_text("html")
                with open(page_html_path, "w", encoding="utf-8") as f:
                    f.write(html_content or "") 
                pages_processed_this_call += 1
                last_page_actually_extracted = i
            else:
                last_page_actually_extracted = max(last_page_actually_extracted, i)
        
        is_processing_complete = last_page_actually_extracted >= total_pages_in_pdf
        doc.close()

        return JSONResponse(content={
            "status": f"{pages_processed_this_call} pages processed in this batch.", 
            "filename": filename, 
            "totalPages": total_pages_in_pdf,
            "lastPageExtractedInBatch": last_page_actually_extracted,
            "isProcessingComplete": is_processing_complete,
            "contentType": "html"
        })
    except Exception as e:
        if doc: # Check if doc was assigned
            doc.close()
        print(f"Error during PDF extraction for {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Error during PDF extraction: {str(e)}")

@app.post("/force-extract-page/{filename}/{page_num}")
def force_extract_single_page(filename: str, page_num: int):
    pdf_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    file_base, _ = os.path.splitext(filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    os.makedirs(output_dir_for_file, exist_ok=True)

    try:
        doc = fitz.open(pdf_path) # Use PyMuPDF
        if not (0 < page_num <= len(doc)):
            doc.close()
            raise HTTPException(status_code=400, detail=f"Page number {page_num} is out of range for {filename}.")
        
        page_to_extract = doc.load_page(page_num - 1) # 0-indexed
        # Get HTML output from PyMuPDF. This HTML is basic but preserves some structure.
        # For higher fidelity, pdf2htmlEX would be an option, but adds external CLI dependency.
        content = page_to_extract.get_text("html")
        doc.close()
        
        page_content_filename = f"page_{page_num}.html" # Save as .html
        with open(os.path.join(output_dir_for_file, page_content_filename), "w", encoding="utf-8") as f:
            f.write(content or "") 
        
        return JSONResponse(content={
            "status": "success", 
            "message": f"Page {page_num} of {filename} re-extracted and saved as HTML.",
            "filename": filename,
            "pageExtracted": page_num,
            "contentType": "html"
        })
    except Exception as e:
        if 'doc' in locals() and doc:
            doc.close()
        print(f"Error during single page force extraction for {filename}, page {page_num}: {e}")
        raise HTTPException(status_code=500, detail=f"Error during single page extraction: {str(e)}")

@app.get("/extracted-content/{filename}/{page_num}") # Renamed from /extracted-markdown
def get_extracted_page_content(filename: str, page_num: int): # Renamed
    file_base, _ = os.path.splitext(filename)
    page_content_path = os.path.join(EXTRACTED_DIR, file_base, f"page_{page_num}.html") # Look for .html

    if not os.path.exists(page_content_path):
        # This now implies the frontend should trigger /extract if this page is needed and not yet processed.
        # Or, it could mean that /force-extract-page should be called for HTML conversion if only .md exists
        return JSONResponse(content={"filename": filename, "page": page_num, "html_content": "", "status": "not_found", "contentType": "html"}, status_code=200)

    with open(page_content_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    return JSONResponse(content={"filename": filename, "page": page_num, "html_content": html_content, "status": "found", "contentType": "html"})

@app.post("/save-html/{filename}/{page_num}") 
def save_edited_html_content(filename: str, page_num: int, request_data: ContentSaveRequest): # Changed to ContentSaveRequest
    file_base, _ = os.path.splitext(filename)
    output_dir_for_file = os.path.join(EXTRACTED_DIR, file_base)
    os.makedirs(output_dir_for_file, exist_ok=True) 
    
    page_html_path = os.path.join(output_dir_for_file, f"page_{page_num}.html")

    try:
        with open(page_html_path, "w", encoding="utf-8") as f:
            f.write(request_data.content) # Changed to request_data.content
        return JSONResponse(content={"status": "success", "message": f"Page {page_num} of {filename} saved (HTML)."}, status_code=200)
    except Exception as e:
        print(f"Error saving HTML for {filename}, page {page_num}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save HTML: {str(e)}") 