# Xtract - PDF to Markdown Converter

## Overview

Xtract is a web application designed to help you convert PDF documents into editable Markdown. It provides a user-friendly interface to upload PDFs, preview them, view extracted text page by page, edit the text, and export the results.

## Key Features

*   **PDF Upload:** Upload PDF files via a button or drag-and-drop into the file list or PDF preview areas.
*   **File Management:** View a list of uploaded PDF files.
*   **PDF Preview:** Interactive PDF viewer (powered by PDF.js) with page navigation (next, previous, go to page).
*   **Text Extraction:** Automated text extraction from PDF pages on a rolling basis (powered by `pdfplumber` on the backend).
*   **Markdown Display & Editing:**
    *   View extracted text for the current PDF page in a Markdown-aware text area.
    *   Edit the extracted Markdown text.
    *   Save changes back to the server.
    *   Refresh/Re-extract text for the current page.
*   **Export Options (Dropdown Menu):
    *   **Current Page:**
        *   Save as Text (.txt)
        *   Save as Word (.docx)
    *   **All Pages:**
        *   Export All Pages as Text (.txt) (collates content from all pages, extracting if necessary)
        *   Export All Pages as Word (.docx) (collates content from all pages, extracting if necessary)
*   **Responsive UI:**
    *   Three-panel layout: Files, PDF Preview, Markdown Editor.
    *   Collapsible left panel (file list).
    *   Visual feedback for drop zones and processing status (spinners).
*   **Backend:** Built with FastAPI (Python).
*   **Frontend:** HTML, Tailwind CSS, and vanilla JavaScript.

## Project Structure

```
/
├── main.py             # FastAPI backend server
├── requirements.txt    # Python dependencies
├── static/               # Frontend assets
│   ├── index.html      # Main HTML file
│   ├── app.js          # Client-side JavaScript
│   └── favicon.svg     # Application icon
├── uploaded_files/     # Storage for uploaded PDFs
├── extracted/          # Storage for extracted Markdown files (per page)
├── .gitignore          # Specifies intentionally untracked files
└── README.md           # This file
```

## Setup

### Prerequisites

*   Python 3.11 or higher.
*   `pip` for installing Python packages.

### 1. Clone the Repository (if you haven't)

```bash
git clone <your-repository-url>
cd <repository-directory>
```

### 2. Create and Activate a Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the Server

```bash
uvicorn main:app --reload
```

### 5. Access the Application

Open your web browser and navigate to: [http://localhost:8000](http://localhost:8000)

## How It Works

1.  **Upload:** Users upload a PDF. The file is saved in the `uploaded_files/` directory.
2.  **Listing:** The backend provides a list of files from `uploaded_files/` to display in the left panel.
3.  **Selection & Display:** When a file is selected (or dropped in the preview area):
    *   The PDF is rendered page by page in the middle panel using PDF.js.
    *   The backend is called to extract text for the current page (and subsequent pages in batches using the `/extract/{filename}` endpoint). Extracted text is saved as individual `.md` files in `extracted/{pdf_name_without_extension}/page_{number}.md`.
4.  **Markdown View:** The frontend fetches the corresponding `.md` file for the currently viewed PDF page via `/extracted-markdown/{filename}/{page_num}` and displays its content in the right panel.
5.  **Editing & Saving:** Users can edit the Markdown. Clicking "Save" (checkmark icon) sends the content to `/save-markdown/{filename}/{page_num}` to update the `.md` file.
6.  **Refresh:** Users can re-trigger extraction for the current page using the refresh button, which calls `/force-extract-page/{filename}/{page_num}`.
7.  **Export:** Users can export the content of the current page or all pages as `.txt` or `.docx` files. The "Export All" functionality will iterate through all pages, force-extracting any missing ones, before collating and downloading.

## Future Considerations / Potential Improvements

*   More robust error handling for PDF parsing and extraction.
*   Table and image extraction (currently focused on text).
*   Server-side processing for "Export All" to handle very large PDFs more efficiently.
*   User authentication and management if deployed in a multi-user environment.
*   More sophisticated Markdown to DOCX conversion (preserving more formatting).
*   Unit and integration tests. 