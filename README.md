# Xtract - PDF to Markdown Converter

## Overview

Xtract is a work-in-progress project aimed at providing a comprehensive solution for extracting information from PDF documents, verifying the extraction, and leveraging Large Language Models (LLMs) for querying the extracted content.

## Core Features / Goals

1.  **Accurate PDF Content Extraction:**
    *   Robustly extract textual content from diverse PDF layouts.
    *   Extract information from embedded charts and tables.
    *   Process and extract relevant information from images within PDFs (e.g., through OCR).
    *   Obtain positional information (bounding boxes) for each extracted element.

2.  **LLM Integration for Query Answering:**
    *   Prepare and feed the extracted and verified content to Large Language Models.
    *   Enable users to ask natural language questions about the PDF content and receive accurate answers.

3.  **User Interface for Verification and Correction:**
    *   **PDF Viewer:** Display the original PDF document.
    *   **Extracted Content Panel:** Show the structured text and data extracted from the PDF.
    *   **Verification & Editing:** Allow users to easily compare the original PDF with the extracted content, identify inaccuracies, and edit/correct the extracted text.
    *   **Save Corrections:** Persist user corrections to improve the quality of the data fed to the LLM.

4.  **Interactive Bounding Box and Text Highlighting (Next Steps):**
    *   When an element (text block, image, chart) is selected or hovered over in the PDF view, draw a bounding box around it.
    *   Simultaneously, the corresponding extracted text/data in the content panel should be highlighted.
    *   Conversely, selecting or hovering over text in the content panel should highlight the corresponding element in the PDF view.

## Current UI Mockup

The envisioned UI has three main panels:

*   **Left Panel:** File navigation and project management.
*   **Middle Panel:** PDF document viewer. This panel will eventually support drawing bounding boxes around detected elements.
*   **Right Panel:** Display area for the extracted text and data. This panel will show the content corresponding to selected elements in the PDF and allow for editing.

![UI Mockup](images/xtract-ui-v1.png)

## Technical Approach & Considerations

### 1. PDF Parsing and Element Recognition:
*   Leverage advanced OCR and layout parsing libraries. Tools like **`unstructured.io`** (especially its `hi_res` strategy which can utilize models like `Detectron2` for layout detection) are strong candidates for their ability to handle diverse PDF structures and output element-wise data with coordinates.
*   **`PyMuPDF` (Fitz)** is another powerful Python library for deep PDF manipulation, capable of extracting text, images, and their precise bounding box coordinates. This can be used directly or as a component within a larger extraction pipeline.
*   The goal is to not just get raw text, but to segment the document into meaningful units (paragraphs, titles, figures, tables, list items) with their locations on the page.

### 2. UI for Verification and Interaction:
*   **PDF Rendering:** For a web-based UI, **`pdf.js`** by Mozilla is a standard choice for rendering PDFs in the browser. For a desktop application, libraries compatible with the chosen GUI framework (e.g., Qt with Poppler bindings) would be used.
*   **Bounding Box Overlay:** An overlay canvas on top of the PDF rendering area will be used to draw bounding boxes.
*   **Text Panel:** The extracted text will be displayed in a separate panel. This could be a rich text editor or a custom component that allows highlighting and editing.
*   **Synchronization Logic:** JavaScript (for web) or equivalent UI logic will be needed to:
    *   Map PDF coordinates to screen coordinates for drawing.
    *   Link elements in the PDF view (via their bounding boxes) to their corresponding text segments in the extraction panel.
    *   Handle click/hover events on either panel to trigger highlighting in the other.

### 3. Data Flow and Storage:
*   **Backend:** A Python backend (e.g., using **`FastAPI`** or **`Flask`**) will handle:
    *   Receiving PDF uploads.
    *   Running the extraction pipeline (`unstructured`, `PyMuPDF`, etc.).
    *   Storing the extracted content (text, type of element, page number, coordinates). A structured format like JSON lines or a database would be suitable.
    *   Serving the PDF and the extracted data to the frontend.
    *   Receiving and persisting user corrections.
*   **Frontend:** A modern JavaScript framework (e.g., **`React`**, **`Vue.js`**, or **`Svelte`**) will manage the UI components and interact with the backend via APIs.

### 4. LLM Integration:
*   Once content is extracted and verified, it will be processed (chunked, embedded) and fed into an LLM framework (e.g., `LangChain`, `LlamaIndex`) for retrieval-augmented generation (RAG) to answer user queries.

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