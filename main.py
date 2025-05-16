from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel # Added for request body model
import os
import pdfplumber # Added for PDF processing
from typing import List, Optional # Added Optional

UPLOAD_DIR = "uploaded_files"
EXTRACTED_DIR = "extracted"
STATIC_DIR = "static"
BATCH_SIZE = 5 # Number of pages to extract in one go

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

    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages_in_pdf = len(pdf.pages)
            if page_hint > total_pages_in_pdf:
                page_hint = total_pages_in_pdf # Cap page_hint
            
            # Determine the highest page already extracted
            highest_extracted = 0
            for i in range(1, total_pages_in_pdf + 1):
                if os.path.exists(os.path.join(output_dir_for_file, f"page_{i}.md")):
                    highest_extracted = i
                else:
                    break # Found the first unextracted page

            start_page_for_batch = highest_extracted + 1
            # If page_hint is higher than what we've extracted + 1, it implies a jump
            # For simplicity now, we'll just try to extract starting from page_hint if it's not yet covered
            # A more sophisticated logic could check if page_hint is already within a processed batch.
            if page_hint > highest_extracted:
                 start_page_for_batch = page_hint 
            
            # Ensure we don't try to extract beyond the PDF
            if start_page_for_batch > total_pages_in_pdf:
                return JSONResponse(content={
                    "status": "All pages already processed or requested page out of bounds.",
                    "filename": filename,
                    "totalPages": total_pages_in_pdf,
                    "lastPageExtractedInBatch": highest_extracted,
                    "isProcessingComplete": True
                })

            end_page_for_batch = min(start_page_for_batch + BATCH_SIZE - 1, total_pages_in_pdf)
            pages_processed_this_call = 0
            last_page_actually_extracted = highest_extracted

            for i in range(start_page_for_batch, end_page_for_batch + 1):
                if not os.path.exists(os.path.join(output_dir_for_file, f"page_{i}.md")):
                    page = pdf.pages[i-1] # pdf.pages is 0-indexed
                    text = page.extract_text()
                    page_md_filename = f"page_{i}.md"
                    with open(os.path.join(output_dir_for_file, page_md_filename), "w", encoding="utf-8") as f:
                        f.write(text or "") 
                    pages_processed_this_call += 1
                    last_page_actually_extracted = i
                else:
                    # If we encounter an already extracted page within the intended batch (e.g. due to page_hint jump)
                    # we can assume this part is done. For a simpler batch logic, we might just update last_page_actually_extracted.
                    last_page_actually_extracted = max(last_page_actually_extracted, i)
            
            is_processing_complete = last_page_actually_extracted >= total_pages_in_pdf

            return JSONResponse(content={
                "status": f"{pages_processed_this_call} pages processed in this batch.", 
                "filename": filename, 
                "totalPages": total_pages_in_pdf,
                "lastPageExtractedInBatch": last_page_actually_extracted,
                "isProcessingComplete": is_processing_complete
            })
    except Exception as e:
        # Log the exception for server-side debugging
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
        with pdfplumber.open(pdf_path) as pdf:
            if not (0 < page_num <= len(pdf.pages)):
                raise HTTPException(status_code=400, detail=f"Page number {page_num} is out of range for {filename}.")
            
            page_to_extract = pdf.pages[page_num - 1] # pdf.pages is 0-indexed
            text = page_to_extract.extract_text()
            
            page_md_filename = f"page_{page_num}.md"
            with open(os.path.join(output_dir_for_file, page_md_filename), "w", encoding="utf-8") as f:
                f.write(text or "") 
            
            return JSONResponse(content={
                "status": "success", 
                "message": f"Page {page_num} of {filename} re-extracted and saved.",
                "filename": filename,
                "pageExtracted": page_num
            })
    except Exception as e:
        print(f"Error during single page force extraction for {filename}, page {page_num}: {e}")
        raise HTTPException(status_code=500, detail=f"Error during single page extraction: {str(e)}")

@app.get("/extracted-markdown/{filename}/{page_num}")
def get_extracted_markdown(filename: str, page_num: int):
    file_base, _ = os.path.splitext(filename)
    page_md_path = os.path.join(EXTRACTED_DIR, file_base, f"page_{page_num}.md")

    if not os.path.exists(page_md_path):
        # This now implies the frontend should trigger /extract if this page is needed and not yet processed.
        return JSONResponse(content={"filename": filename, "page": page_num, "markdown": "", "status": "not_found"}, status_code=200)

    with open(page_md_path, "r", encoding="utf-8") as f:
        markdown_content = f.read()
    return JSONResponse(content={"filename": filename, "page": page_num, "markdown": markdown_content, "status": "found"})

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