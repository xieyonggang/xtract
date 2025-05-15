# Xtract PDF to Markdown

## Overview
This application extracts PDF documents into markdown text format, allowing you to verify, edit, and export the extracted content. It supports extraction of text, tables (as markdown tables), and images. The UI features a 3-panel design for file management, PDF preview, and markdown editing/export.

## Project Structure
```
xtract/
├── main.py
├── requirements.txt
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── uploaded_files/
├── extracted/
└── README.md
```

## Setup

### 1. Install dependencies
Make sure you are using **Python 3.11**.
```bash
pip install -r requirements.txt
```

### 2. Run the server
```bash
uvicorn main:app --reload
```

### 3. Access the app
Open your browser and go to: [http://localhost:8000](http://localhost:8000)

## Notes
- Uploaded PDFs are stored in `uploaded_files/`.
- Extracted markdown and images are stored in `extracted/`.
- All frontend files are in the `static/` directory and served by FastAPI. 