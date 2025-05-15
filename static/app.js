// static/app.js
document.addEventListener('DOMContentLoaded', function() {
    const leftPanel = document.getElementById('left-panel');
    const toggleLeft = document.getElementById('toggle-left');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const gotoPageInput = document.getElementById('goto-page');
    const gotoBtn = document.getElementById('goto-btn');
    const pageInfo = document.getElementById('page-info');
    const markdownView = document.getElementById('markdown-view');
    const editBtn = document.getElementById('edit-btn');
    const lockBtn = document.getElementById('lock-btn');
    const exportBtn = document.getElementById('export-btn');

    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 1;
    let currentFile = null;
    let isEditingMarkdown = false;

    // Toggle left panel
    toggleLeft.addEventListener('click', () => {
        leftPanel.classList.toggle('collapsed');
    });

    // Upload button triggers file input
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file upload
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        loadFileList();
    });

    // Load file list from backend
    async function loadFileList() {
        const res = await fetch('/files');
        const files = await res.json();
        fileList.innerHTML = '';
        files.forEach(filename => {
            const li = document.createElement('li');
            li.textContent = filename;
            li.className = 'file-item cursor-pointer px-2 py-1 rounded hover:bg-blue-100 break-words overflow-hidden';
            li.style.display = 'block';
            li.style.maxHeight = '2.8em'; // ~2 lines
            li.style.lineHeight = '1.4em';
            li.style.textOverflow = 'ellipsis';
            li.style.webkitLineClamp = 2;
            li.style.webkitBoxOrient = 'vertical';
            li.style.overflow = 'hidden';
            li.style.display = '-webkit-box';
            li.title = filename; // Tooltip with full name
            li.addEventListener('click', () => {
                console.log('File item clicked:', filename); // Log click
                loadAndRenderPDF(filename);
            });
            fileList.appendChild(li);
        });
    }

    // Edit/Save button functionality
    editBtn.addEventListener('click', async () => {
        if (isEditingMarkdown) {
            if (!currentFile || !currentPage) {
                alert("No file or page selected to save.");
                return;
            }
            const updatedMarkdown = markdownView.value;
            try {
                const response = await fetch(`/save-markdown/${encodeURIComponent(currentFile)}/${currentPage}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ markdown: updatedMarkdown })
                });
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ detail: "Unknown error saving markdown" }));
                    throw new Error(errorResult.detail || response.statusText);
                }
                const result = await response.json();
                markdownView.setAttribute('readonly', true);
                editBtn.textContent = 'Edit';
                editBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
                editBtn.classList.add('bg-green-500', 'hover:bg-green-600');
                lockBtn.style.display = 'inline-block';
                exportBtn.style.display = 'inline-block';
                isEditingMarkdown = false;
            } catch (error) {
                console.error("Error saving markdown:", error);
                alert(`Error saving: ${error.message}`);
            }
        } else {
            markdownView.removeAttribute('readonly');
            editBtn.textContent = 'Save';
            editBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            editBtn.classList.add('bg-red-500', 'hover:bg-red-600');
            lockBtn.style.display = 'none';
            exportBtn.style.display = 'none';
            isEditingMarkdown = true;
            markdownView.focus();
        }
    });

    // Optional: Lock button to discard changes (or just disable if edit takes over)
    lockBtn.addEventListener('click', () => {
        if (!isEditingMarkdown) {
            markdownView.setAttribute('readonly', true);
            editBtn.textContent = 'Edit';
            editBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
            editBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            console.log("Markdown view locked (already read-only).");
        } else {
            alert("Click Save to commit changes or reload the page data to discard.");
        }
    });

    // Load and render PDF using PDF.js, and trigger text extraction
    async function loadAndRenderPDF(filename) {
        console.log('loadAndRenderPDF called for:', filename);
        currentFile = filename;
        markdownView.value = 'Extracting text...';
        if (isEditingMarkdown) {
            markdownView.setAttribute('readonly', true);
            editBtn.textContent = 'Edit';
            editBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
            editBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            lockBtn.style.display = 'inline-block';
            exportBtn.style.display = 'inline-block';
            isEditingMarkdown = false;
        }

        // Trigger extraction process on the backend
        try {
            console.log(`Requesting extraction for ${filename}...`);
            const extractResponse = await fetch(`/extract/${encodeURIComponent(filename)}`, {
                method: 'POST'
            });
            const extractResult = await extractResponse.json();
            if (!extractResponse.ok) {
                console.error('Extraction request failed:', extractResult);
                markdownView.value = `Error during extraction: ${extractResult.detail || 'Unknown error'}`;
            } else {
                console.log('Extraction request successful:', extractResult);
            }
        } catch (error) {
            console.error('Error calling extraction endpoint:', error);
            markdownView.value = 'Error initiating text extraction.';
        }

        const url = `/file/${encodeURIComponent(filename)}`;
        const pdfjsViewer = window.pdfjsLib || globalThis.pdfjsLib;

        if (!pdfjsViewer || typeof pdfjsViewer.getDocument !== 'function') {
            console.error('PDF.js library (pdfjsLib) is NOT loaded correctly or getDocument method is missing.');
            alert('Critical Error: PDF library (PDF.js) failed to load.');
            markdownView.value = 'Error: PDF viewing library not loaded.';
            return;
        }

        try {
            console.log('PDF.js library appears to be available. Proceeding to load PDF.');
            console.log('Using pdfjsViewer.GlobalWorkerOptions.workerSrc:', pdfjsViewer.GlobalWorkerOptions.workerSrc);
            const loadingTask = pdfjsViewer.getDocument(url); 
            console.log('pdfjsViewer.getDocument called, loadingTask created.');
            pdfDoc = await loadingTask.promise;
            console.log('PDF document loaded successfully:', pdfDoc ? 'Loaded' : 'Failed to load');

            if (pdfDoc) {
                totalPages = pdfDoc.numPages;
                currentPage = 1;
                renderPage(currentPage);
            } else {
                throw new Error("pdfDoc is null after getDocument promise resolved.");
            }
        } catch (error) {
            console.error(`Error during PDF processing for "${filename}":`, error);
            alert(`Failed to load or render PDF: ${filename}. Check console.`);
            const context = pdfCanvas.getContext('2d');
            if (context) context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            pageInfo.textContent = 'Failed to load PDF';
            markdownView.value = 'Failed to load PDF for viewing.';
            pdfDoc = null;
        }
    }

    async function renderPage(pageNum) {
        if (isEditingMarkdown) {
            console.log("Navigating page while editing. Consider save prompt.");
        }
        if (!pdfDoc) {
            console.warn("renderPage called but pdfDoc is null or undefined.");
            pageInfo.textContent = 'Error: PDF document not loaded.';
            markdownView.value = 'PDF not loaded. Cannot display extracted text.';
            return;
        }
        try {
            console.log(`Rendering page ${pageNum} of ${totalPages}`);
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const context = pdfCanvas.getContext('2d');
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;
            pageInfo.textContent = `Page ${pageNum} / ${totalPages}`;
            console.log(`Page ${pageNum} rendered successfully.`);
            fetchExtractedMarkdown(currentFile, pageNum);
        } catch (error) {
            console.error(`Error rendering page ${pageNum} for PDF "${currentFile}":`, error);
            alert(`Error rendering page ${pageNum}. Check console.`);
            pageInfo.textContent = `Error rendering page ${pageNum}`;
            markdownView.value = `Error rendering PDF page ${pageNum}.`;
        }
    }

    async function fetchExtractedMarkdown(filename, pageNum) {
        if (!filename) return;
        console.log(`Fetching extracted markdown for ${filename}, page ${pageNum}`);
        if (isEditingMarkdown) {
            console.log("Currently editing, not fetching new markdown for this page unless forced.");
            return;
        }
        markdownView.value = `Loading extracted text for page ${pageNum}...`;
        try {
            const response = await fetch(`/extracted-markdown/${encodeURIComponent(filename)}/${pageNum}`);
            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ detail: "Unknown error fetching markdown" }));
                console.error('Failed to fetch markdown:', response.status, errorResult);
                markdownView.value = `Error loading extracted text: ${errorResult.detail || response.statusText}`;
                return;
            }
            const data = await response.json();
            markdownView.value = data.markdown || 'No text extracted for this page.';
            console.log('Markdown loaded successfully.');
        } catch (error) {
            console.error('Error fetching or parsing markdown:', error);
            markdownView.value = 'Error fetching extracted text.';
        }
    }

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
        }
    });
    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
        }
    });
    gotoBtn.addEventListener('click', () => {
        const page = parseInt(gotoPageInput.value);
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            renderPage(currentPage);
        }
    });

    loadFileList();
});