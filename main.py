import os
import shutil
import uuid # For generating unique IDs for elements
from pathlib import Path
from typing import List, Dict, Any

import uvicorn
import aiofiles
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from unstructured.partition.pdf import partition_pdf
from unstructured.documents.elements import Element
# from unstructured.documents.html import HTMLDocument # Commented out
from bs4 import BeautifulSoup

# For environment variables, e.g., API keys for cloud models if used later
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
UPLOADED_FILES_DIR = BASE_DIR / "uploaded_files"
EXTRACTED_DATA_DIR = BASE_DIR / "extracted_data" # New directory for JSON/HTML
STATIC_DIR = BASE_DIR / "static"

UPLOADED_FILES_DIR.mkdir(parents=True, exist_ok=True)
EXTRACTED_DATA_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=STATIC_DIR)

@app.get("/file/{filename}") # Endpoint to serve PDF files for display
async def get_pdf_file_for_display(filename: str):
    # Basic sanitization to prevent directory traversal
    safe_filename = Path(filename).name
    file_path = UPLOADED_FILES_DIR / safe_filename
    if file_path.is_file() and file_path.exists():
        return FileResponse(file_path, media_type='application/pdf', filename=safe_filename)
    raise HTTPException(status_code=404, detail=f"File {safe_filename} not found in uploaded files.")

# Helper function to convert unstructured Element to a JSON-serializable dict
def element_to_dict(element: Element) -> Dict[str, Any]:
    data = {
        "id": str(element.id), # Use the ID from the unstructured.io element
        "type": element.category,
        "text": element.text,
    }
    if hasattr(element, 'metadata'):
        data["metadata"] = element.metadata.to_dict()
        # Ensure coordinates are serializable if they exist
        if hasattr(element.metadata, 'coordinates') and element.metadata.coordinates:
            data["metadata"]["coordinates"] = element.metadata.coordinates.to_dict()
    return data

async def run_extraction(
    pdf_path: Path, 
    pdf_filename: str,
    start_page_num: int | None = None, # 1-indexed
    end_page_num: int | None = None     # 1-indexed, inclusive
):
    pdf_name_no_ext = pdf_filename.rsplit('.', 1)[0]
    output_pdf_dir = EXTRACTED_DATA_DIR / pdf_name_no_ext
    output_pdf_dir.mkdir(parents=True, exist_ok=True)
    
    log_prefix = f"[run_extraction for {pdf_filename}"
    if start_page_num and end_page_num:
        log_prefix += f" (pages {start_page_num}-{end_page_num})]"
    else:
        log_prefix += " (full document)]"
    print(f"{log_prefix} Output directory: {output_pdf_dir}")

    partition_kwargs = {
        "filename": str(pdf_path),
        "include_page_breaks": True,
        "strategy": "fast",
    }
    if start_page_num is not None:
        partition_kwargs["starting_page_number"] = start_page_num
    if end_page_num is not None:
        partition_kwargs["ending_page_number"] = end_page_num

    try:
        elements = partition_pdf(**partition_kwargs)
        if not elements:
            print(f"{log_prefix} Warning: partition_pdf returned no elements.")
        else:
            print(f"{log_prefix} partition_pdf returned {len(elements)} elements.")

    except Exception as e:
        print(f"{log_prefix} CRITICAL ERROR during unstructured partitioning: {e}")
        elements = []

    pages_elements: Dict[int, List[Element]] = {}
    elements_without_page_number_count = 0
    for el_idx, el in enumerate(elements):
        page_num = getattr(el.metadata, 'page_number', None)
        if page_num is not None:
            # Filter elements based on the requested page range if specified
            if start_page_num and end_page_num:
                if not (start_page_num <= page_num <= end_page_num):
                    continue # Skip elements outside the requested page range for batched extraction
            pages_elements.setdefault(page_num, []).append(el)
        else:
            elements_without_page_number_count += 1
    
    if elements_without_page_number_count > 0:
        print(f"{log_prefix} Warning: {elements_without_page_number_count}/{len(elements)} elements had no page_number.")

    if not pages_elements and elements:
        print(f"{log_prefix} Warning: No elements could be grouped by page number, though {len(elements)} elements were extracted.")

    for page_num, page_els in pages_elements.items():
        page_json_path = output_pdf_dir / f"page_{page_num}.json"
        page_html_path = output_pdf_dir / f"page_{page_num}.html"
        print(f"{log_prefix} Processing page {page_num}. JSON: {page_json_path}, HTML: {page_html_path}")

        page_json_data = [element_to_dict(el) for el in page_els]
        try:
            async with aiofiles.open(page_json_path, "w", encoding="utf-8") as f:
                import json
                await f.write(json.dumps(page_json_data, indent=2))
            print(f"{log_prefix} Successfully wrote JSON for page {page_num}.")
        except Exception as e_json_write:
            print(f"{log_prefix} ERROR writing JSON for page {page_num}: {e_json_write}")

        page_html_content = f"<div><p>Rich HTML preview is temporarily disabled for page {page_num}.</p><p>Text content:</p><ul>"
        for el_item in page_els:
            page_html_content += f"<li id='{str(el_item.id)}'>{str(el_item.text)}</li>"
        page_html_content += "</ul></div>"
        print(f"{log_prefix} HTML generation via HTMLDocument is commented out for page {page_num}. Using basic list fallback.")

        try:
            async with aiofiles.open(page_html_path, "w", encoding="utf-8") as f:
                await f.write(page_html_content)
            print(f"{log_prefix} Successfully wrote placeholder HTML for page {page_num} (length: {len(page_html_content)}).")
        except Exception as e_html_write:
            print(f"{log_prefix} ERROR writing placeholder HTML for page {page_num}: {e_html_write}")
    
    if not elements:
        print(f"{log_prefix} No elements were processed. No files written to {output_pdf_dir}.")
    elif not pages_elements:
        print(f"{log_prefix} Elements were extracted but not grouped by page. No page-specific files written.")

    # Only write/overwrite _full_document.json if processing the entire document
    if start_page_num is None and end_page_num is None:
        all_elements_json = [element_to_dict(el) for el in elements] # Use original elements list from full partition
        try:
            async with aiofiles.open(output_pdf_dir / "_full_document.json", "w", encoding="utf-8") as f:
                import json
                await f.write(json.dumps(all_elements_json, indent=2))
            print(f"{log_prefix} Successfully wrote _full_document.json with {len(all_elements_json)} elements.")
        except Exception as e_full_json_write:
            print(f"{log_prefix} ERROR writing _full_document.json: {e_full_json_write}")
    else:
        print(f"{log_prefix} Batched extraction, _full_document.json was not updated.")


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload/")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    
    # Sanitize filename before creating path
    safe_filename = Path(file.filename).name # Basic sanitization
    file_path = UPLOADED_FILES_DIR / safe_filename
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)

    await run_extraction(file_path, safe_filename)

    return {"filename": safe_filename, "detail": "File uploaded and initial extraction triggered."}


@app.get("/files/")
async def list_files():
    files = [f.name for f in UPLOADED_FILES_DIR.iterdir() if f.is_file() and f.name.lower().endswith(".pdf")]
    return files

@app.get("/extracted-html/{filename}/{page_num}")
async def get_extracted_html(filename: str, page_num: int):
    safe_filename = Path(filename).name # Basic sanitization
    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    html_file_path = EXTRACTED_DATA_DIR / pdf_name_no_ext / f"page_{page_num}.html"
    
    # Return a message indicating HTML processing is disabled, but still attempt to serve the placeholder if it exists
    if html_file_path.exists():
        async with aiofiles.open(html_file_path, "r", encoding="utf-8") as f:
            content = await f.read()
        return HTMLResponse(content=content) # Serve the placeholder
    else:
        # If placeholder doesn't exist (e.g., extraction failed or file deleted), run extraction.
        pdf_file_path = UPLOADED_FILES_DIR / safe_filename
        if pdf_file_path.exists():
            print(f"[get_extracted_html] HTML file {html_file_path} not found for page {page_num}. Triggering batch re-extraction.")
            # Extract a batch of 5 pages starting from the requested page
            await run_extraction(pdf_file_path, safe_filename, start_page_num=page_num, end_page_num=page_num + 4)
            if not html_file_path.exists(): 
                 error_message = f"<div><p>Rich HTML preview is temporarily disabled. Placeholder HTML for page {page_num} of {safe_filename} not found even after attempting re-extraction. Check server logs.</p></div>"
                 return HTMLResponse(content=error_message, status_code=404)
        else:
            error_message = f"<div><p>Rich HTML preview is temporarily disabled. Original PDF {safe_filename} not found, cannot generate content for page {page_num}.</p></div>"
            return HTMLResponse(content=error_message, status_code=404)

    # This part should be reached if html_file_path exists either initially or after re-extraction
    async with aiofiles.open(html_file_path, "r", encoding="utf-8") as f:
        content = await f.read()
    return HTMLResponse(content=content)

@app.get("/extracted-json/{filename}/{page_num}")
async def get_extracted_json(filename: str, page_num: int):
    safe_filename = Path(filename).name
    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    json_file_path = EXTRACTED_DATA_DIR / pdf_name_no_ext / f"page_{page_num}.json"

    if not json_file_path.exists():
        pdf_file_path = UPLOADED_FILES_DIR / safe_filename
        if pdf_file_path.exists():
            print(f"[get_extracted_json] JSON file {json_file_path} not found for page {page_num}. Triggering batch re-extraction.")
            # Extract a batch of 5 pages starting from the requested page
            await run_extraction(pdf_file_path, safe_filename, start_page_num=page_num, end_page_num=page_num + 4)
            if not json_file_path.exists(): 
                raise HTTPException(status_code=404, detail=f"JSON for page {page_num} of {safe_filename} not found even after attempting batch re-extraction. Check server logs.")
        else: 
            raise HTTPException(status_code=404, detail=f"Original PDF {safe_filename} not found, cannot find JSON for page {page_num}.")
    
    async with aiofiles.open(json_file_path, "r", encoding="utf-8") as f:
        # Read as text first to ensure it's valid JSON before parsing with JSONResponse
        json_text_content = await f.read()
    try:
        # Validate and parse the JSON content to ensure it's well-formed for JSONResponse
        import json
        json_content = json.loads(json_text_content)
        return JSONResponse(content=json_content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Invalid JSON format in file {json_file_path}")

@app.post("/save-html/{filename}/{page_num}")
async def save_html_content(filename: str, page_num: int, request: Request):
    safe_filename = Path(filename).name
    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    html_file_path = EXTRACTED_DATA_DIR / pdf_name_no_ext / f"page_{page_num}.html"
    
    if not html_file_path.parent.exists():
        html_file_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        data = await request.json()
        content_to_save = data.get("content", "")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    async with aiofiles.open(html_file_path, "w", encoding="utf-8") as f:
        await f.write(content_to_save)
    
    return {"detail": f"HTML for page {page_num} of {safe_filename} saved."}


@app.post("/force-extract-page/{filename}/{page_num}")
async def force_extract_page_endpoint(filename: str, page_num: int):
    safe_filename = Path(filename).name
    pdf_file_path = UPLOADED_FILES_DIR / safe_filename
    if not pdf_file_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF file {safe_filename} not found.")

    # Force extract should probably try to extract the specific page if possible, 
    # or the full document if specific page extraction isn't producing the file.
    # For now, let's make it run for a batch including the page like the other get endpoints.
    print(f"[force_extract_page_endpoint] Forcing batch re-extraction for {safe_filename}, page {page_num}")
    await run_extraction(pdf_file_path, safe_filename, start_page_num=page_num, end_page_num=page_num) 

    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    html_file_path = EXTRACTED_DATA_DIR / pdf_name_no_ext / f"page_{page_num}.html"
    if html_file_path.exists():
        async with aiofiles.open(html_file_path, "r", encoding="utf-8") as f:
            content = await f.read()
        return HTMLResponse(content=content)
    else:
        # This indicates an issue with run_extraction if the file isn't created.
        return HTMLResponse(content=f"<div>Error: Page {page_num} HTML for {safe_filename} not found after re-extraction. Check server logs.</div>", status_code=500)

# --- Export Functionality (Simplified for now) ---
async def get_all_page_texts_for_export(pdf_filename_no_ext: str) -> str:
    doc_dir = EXTRACTED_DATA_DIR / pdf_filename_no_ext
    all_text_content = []
    
    # Check if _full_document.json exists for a more direct approach
    full_doc_json_path = doc_dir / "_full_document.json"
    if full_doc_json_path.exists():
        async with aiofiles.open(full_doc_json_path, "r", encoding="utf-8") as f:
            import json
            elements_data = json.loads(await f.read())
        for el_data in elements_data:
            if el_data.get("text"): # Check if text key exists and is not None
                all_text_content.append(str(el_data.get("text"))) # Ensure text is string
        return "\\n\\n".join(all_text_content)

    # Fallback: Iterate through page JSON files if _full_document.json is not available
    # (This assumes page numbers are somewhat contiguous or we sort them)
    page_files = sorted([p for p in doc_dir.glob("page_*.json")], key=lambda x: int(x.stem.split('_')[1]))

    for page_file in page_files:
        async with aiofiles.open(page_file, "r", encoding="utf-8") as f:
            import json
            page_elements = json.loads(await f.read())
            for el_data in page_elements:
                if el_data.get("text"): # Check if text is not None or empty
                    all_text_content.append(str(el_data.get("text"))) # Ensure text is string
    return "\\n\\n".join(all_text_content)


@app.get("/export/txt/current/{filename}/{page_num}")
async def export_current_page_txt(filename: str, page_num: int):
    safe_filename = Path(filename).name
    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    json_file_path = EXTRACTED_DATA_DIR / pdf_name_no_ext / f"page_{page_num}.json"

    if not json_file_path.exists():
        raise HTTPException(status_code=404, detail=f"Page JSON data for {safe_filename} page {page_num} not found for export.")

    page_text_content = []
    async with aiofiles.open(json_file_path, "r", encoding="utf-8") as f:
        import json
        page_elements = json.loads(await f.read())
        for el_data in page_elements:
            if el_data.get("text"):
                page_text_content.append(str(el_data.get("text")))
    
    content = "\\n\\n".join(page_text_content)
    return FileResponse(
        path=None, # Not used when content is provided directly
        content=content.encode('utf-8'),
        media_type="text/plain",
        filename=f"{pdf_name_no_ext}_page_{page_num}.txt"
    )

@app.get("/export/txt/all/{filename}")
async def export_all_pages_txt(filename: str):
    safe_filename = Path(filename).name
    pdf_name_no_ext = safe_filename.rsplit('.', 1)[0]
    
    # Ensure extraction has happened at least once
    pdf_file_path = UPLOADED_FILES_DIR / safe_filename
    doc_dir = EXTRACTED_DATA_DIR / pdf_name_no_ext
    if not doc_dir.exists() and pdf_file_path.exists(): # If no extracted data, run extraction
        await run_extraction(pdf_file_path, safe_filename)
    elif not pdf_file_path.exists():
        raise HTTPException(status_code=404, detail=f"Original PDF {safe_filename} not found for extraction.")


    content = await get_all_page_texts_for_export(pdf_name_no_ext)
    return FileResponse(
        path=None, 
        content=content.encode('utf-8'),
        media_type="text/plain",
        filename=f"{pdf_name_no_ext}_all_pages.txt"
    )

# Placeholder for DOCX export - this will require more work
# For DOCX, you'd iterate through JSON elements and use python-docx to build the document.
# @app.get("/export/docx/current/{filename}/{page_num}")
# async def export_current_page_docx(filename: str, page_num: int): ...
# @app.get("/export/docx/all/{filename}")
# async def export_all_pages_docx(filename: str): ...

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 