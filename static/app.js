// static/app.js
document.addEventListener('DOMContentLoaded', function() {
    const spinnerModal = document.getElementById('spinner-modal');
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

    // Spinner functions
    function showSpinner(message = "Processing PDF...") {
        if (spinnerModal) {
            spinnerModal.querySelector('p').textContent = message;
            spinnerModal.classList.remove('hidden');
        }
    }
    function hideSpinner() {
        if (spinnerModal) {
            spinnerModal.classList.add('hidden');
        }
    }

    let pdfDoc = null;
    let currentPage = 1;
    let currentFile = null;
    let isEditingMarkdown = false;
    let currentFileTotalPages = 0;
    let highestPageExtractedLocally = 0;
    let isPdfFullyExtracted = false;

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
        showSpinner("Uploading file...");
        const formData = new FormData();
        formData.append('file', file);
        try {
            await fetch('/upload', { method: 'POST', body: formData });
            await loadFileList();
        } catch (err) {
            console.error("Upload error:", err);
        }
        hideSpinner();
    });

    // Load file list from backend
    async function loadFileList() {
        const fileListElement = document.getElementById('file-list');
        if (!fileListElement) {
            console.error('loadFileList Error: DOM element #file-list not found.');
            return;
        }

        console.log('loadFileList: Attempting to fetch /files...');
        try {
            const response = await fetch('/files');
            if (!response.ok) {
                const errorText = await response.text().catch(() => "Could not retrieve error text.");
                console.error(`loadFileList: Fetch /files failed with status ${response.status}. Response: ${errorText}`);
                fileListElement.innerHTML = '<li class="px-2 py-1 text-red-600">Error loading files. Check console.</li>';
                return;
            }

            const files = await response.json();
            console.log('loadFileList: Received files from backend:', files);

            fileListElement.innerHTML = ''; // Clear existing list

            if (Array.isArray(files) && files.length > 0) {
                files.forEach(filename => {
                    const li = document.createElement('li');
                    li.textContent = filename;
                    li.className = 'file-item cursor-pointer px-2 py-1 rounded hover:bg-blue-100 break-words'; // Added break-words
                    
                    // Styles for multi-line truncation with ellipsis
                    li.style.display = '-webkit-box';
                    li.style.webkitLineClamp = '2'; // Number of lines to show
                    li.style.webkitBoxOrient = 'vertical';
                    li.style.overflow = 'hidden';
                    li.style.lineHeight = '1.4em'; // Adjust based on your font size and desired spacing
                    li.style.maxHeight = '2.8em'; // line-height * webkitLineClamp

                    li.title = filename; // Show full name on hover

                    li.addEventListener('click', () => {
                        console.log('File item clicked:', filename);
                        loadAndDisplayPdf(filename);
                    });
                    fileListElement.appendChild(li);
                });
                console.log(`loadFileList: Added ${files.length} files to the list.`);
            } else if (Array.isArray(files) && files.length === 0) {
                console.log('loadFileList: No files returned from backend.');
                fileListElement.innerHTML = '<li class="px-2 py-1 text-gray-500">No files uploaded yet.</li>';
            } else {
                console.error('loadFileList: Backend did not return a valid array of files.', files);
                fileListElement.innerHTML = '<li class="px-2 py-1 text-red-600">Invalid file data from server.</li>';
            }
        } catch (error) {
            console.error('loadFileList: Unexpected error:', error);
            fileListElement.innerHTML = '<li class="px-2 py-1 text-red-600">Failed to load files. Check console.</li>';
        }
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

    // Main function to load PDF, trigger initial extraction, and render first page
    async function loadAndDisplayPdf(filename) {
        console.log('loadAndDisplayPdf for:', filename);
        currentFile = filename;
        currentPage = 1;
        highestPageExtractedLocally = 0;
        isPdfFullyExtracted = false;
        pdfDoc = null;

        if (isEditingMarkdown) {
            markdownView.setAttribute('readonly', true);
            editBtn.textContent = 'Edit';
            editBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
            editBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            lockBtn.style.display = 'inline-block';
            exportBtn.style.display = 'inline-block';
            isEditingMarkdown = false;
        }
        markdownView.value = 'Preparing PDF...';
        pageInfo.textContent = 'Page ? / ?';

        showSpinner(`Fetching info for ${filename}...`);

        try {
            const extractInfo = await triggerExtraction(filename, 1);
            currentFileTotalPages = extractInfo.totalPages;
            highestPageExtractedLocally = extractInfo.lastPageExtractedInBatch;
            isPdfFullyExtracted = extractInfo.isProcessingComplete;
            pageInfo.textContent = `Page ${currentPage} / ${currentFileTotalPages}`;

            const url = `/file/${encodeURIComponent(filename)}`;
            const pdfjsViewer = window.pdfjsLib || globalThis.pdfjsLib;
            if (!pdfjsViewer || typeof pdfjsViewer.getDocument !== 'function') {
                throw new Error('PDF.js library not loaded.');
            }
            const loadingTask = pdfjsViewer.getDocument(url);
            pdfDoc = await loadingTask.promise;
            console.log('PDF document loaded for rendering.');
            
            await renderPdfPage(currentPage); // This will also fetch markdown

        } catch (error) {
            console.error(`Error in loadAndDisplayPdf for "${filename}":`, error);
            alert(`Failed to load PDF: ${error.message}. Check console.`);
            markdownView.value = `Error loading PDF: ${error.message}`;
            pageInfo.textContent = 'Error';
        } finally {
            hideSpinner();
        }
    }

    // Triggers backend extraction for a given page hint
    async function triggerExtraction(filename, pageNumHint) {
        console.log(`Triggering extraction for ${filename}, page hint: ${pageNumHint}`);
        showSpinner(`Processing PDF (page ${pageNumHint} batch)...`);
        try {
            const response = await fetch(`/extract/${encodeURIComponent(filename)}?page_hint=${pageNumHint}`, {
                method: 'POST'
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: "Extraction request failed"}));
                throw new Error(errData.detail);
            }
            const data = await response.json();
            console.log('Extraction response:', data);
            highestPageExtractedLocally = Math.max(highestPageExtractedLocally, data.lastPageExtractedInBatch);
            isPdfFullyExtracted = data.isProcessingComplete;
            currentFileTotalPages = data.totalPages;
            return data;
        } catch (error) {
            console.error("Error in triggerExtraction:", error);
            hideSpinner();
            throw error;
        }
    }

    // Renders the PDF page and then fetches its markdown
    async function renderPdfPage(pageNum) {
        if (!pdfDoc) {
            console.warn("renderPdfPage: pdfDoc not available.");
            markdownView.value = "PDF document not loaded.";
            hideSpinner();
            return;
        }
        if (isEditingMarkdown) {
            console.log("Navigating page while editing. Consider save prompt.");
        }

        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const context = pdfCanvas.getContext('2d');
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            pageInfo.textContent = `Page ${pageNum} / ${currentFileTotalPages}`;
            console.log(`PDF Page ${pageNum} rendered.`);
            await fetchExtractedMarkdown(currentFile, pageNum);
        } catch (error) {
            console.error(`Error rendering PDF page ${pageNum}:`, error);
            markdownView.value = `Error rendering PDF page ${pageNum}.`;
        }
    }

    // Fetches (and triggers extraction if needed) and displays markdown
    async function fetchExtractedMarkdown(filename, pageNum) {
        if (!filename) return;
        console.log(`Fetching markdown for ${filename}, page ${pageNum}. Highest extracted: ${highestPageExtractedLocally}`);
        let extractionWasTriggered = false;

        if (pageNum > highestPageExtractedLocally && !isPdfFullyExtracted) {
            console.log(`Page ${pageNum} not yet extracted. Triggering extraction.`);
            extractionWasTriggered = true;
            try {
                await triggerExtraction(filename, pageNum);
            } catch (error) {
                markdownView.value = `Error during on-demand extraction: ${error.message}`;
                return;
            }
        }
        
        markdownView.value = `Loading text for page ${pageNum}...`;

        try {
            const response = await fetch(`/extracted-markdown/${encodeURIComponent(filename)}/${pageNum}`);
            if (!response.ok) throw new Error(`Server error ${response.status} fetching markdown.`);
            const data = await response.json();

            if (data.status === 'not_found' && !isPdfFullyExtracted && !extractionWasTriggered) {
                console.warn(`Markdown for page ${pageNum} not found, but not fully extracted. User might need to navigate to trigger.`);
                markdownView.value = "Text not yet available. Navigate to this page again to attempt extraction.";
            } else if (data.status === 'not_found' && isPdfFullyExtracted) {
                markdownView.value = 'No text found or extracted for this page (fully processed).';
            } else {
                markdownView.value = data.markdown || 'No text extracted for this page.';
            }
            console.log(`Markdown for page ${pageNum} loaded.`);
        } catch (error) {
            console.error('Error fetching markdown:', error);
            markdownView.value = `Error loading extracted text: ${error.message}`;
        }
    }

    // Event listeners for page navigation
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPdfPage(currentPage);
        }
    });
    nextPageBtn.addEventListener('click', () => {
        if (currentPage < currentFileTotalPages) { // Use dynamic total pages
            currentPage++;
            renderPdfPage(currentPage);
        }
    });
    gotoBtn.addEventListener('click', () => {
        const page = parseInt(gotoPageInput.value);
        if (page >= 1 && page <= currentFileTotalPages) {
            currentPage = page;
            renderPdfPage(currentPage);
        }
    });

    // Initial file list load
    loadFileList().then(() => {
        console.log("Initial file list loaded call completed successfully.");
    }).catch(err => {
        console.error("Initial file list load call failed (promise rejection):", err);
    });
    // NOTE: loadFileList in app.js needs to call loadAndDisplayPdf on item click
    // Make sure the click handler in loadFileList calls `loadAndDisplayPdf(filename);`
});