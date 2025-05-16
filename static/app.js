document.addEventListener('DOMContentLoaded', function() {
    const spinnerModal = document.getElementById('spinner-modal');
    const leftPanel = document.getElementById('left-panel');
    const panelToggle = document.getElementById('panel-toggle');
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
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');

    // Spinner functions
    function showSpinner(message = "Processing PDF...") {
        if (spinnerModal) {
            spinnerModal.querySelector('p').textContent = message;
            spinnerModal.classList.remove('hidden');
        } else {
            console.error("showSpinner: spinnerModal element not found!");
        }
    }
    function hideSpinner() {
        if (spinnerModal) {
            spinnerModal.classList.add('hidden');
        } else {
            console.error("hideSpinner: spinnerModal element not found!");
        }
    }

    let pdfDoc = null;
    let currentPage = 1;
    let currentFile = null;
    let isEditingMarkdown = false;
    let currentFileTotalPages = 0;
    let highestPageExtractedLocally = 0;
    let isPdfFullyExtracted = false;
    let isPanelCollapsed = false;

    // Panel toggle functionality
    panelToggle.addEventListener('click', () => {
        isPanelCollapsed = !isPanelCollapsed;
        leftPanel.classList.toggle('w-80');
        leftPanel.classList.toggle('w-10');
        leftPanel.classList.toggle('p-4');
        leftPanel.classList.toggle('p-0');
        
        const icon = panelToggle.querySelector('.panel-toggle-icon');
        icon.style.transform = isPanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        
        const fileList = document.getElementById('file-list');
        const uploadBtn = document.getElementById('upload-btn');
        const uploadSection = document.getElementById('upload-section');
        const uploadSectionFlexContainer = uploadSection.querySelector('.flex'); // Target the inner flex container
        
        if (isPanelCollapsed) {
            fileList.style.display = 'none';
            uploadBtn.style.display = 'none';
            uploadSectionFlexContainer.style.justifyContent = 'center'; // Center the lone toggle button
            // Adjust padding of the upload-section itself if left-panel p-0 makes it too tight
            uploadSection.style.padding = '0.5rem'; // Give some padding when panel is p-0

        } else {
            fileList.style.display = 'block';
            uploadBtn.style.display = 'block'; // Or 'flex' if needed, but 'block' for button is fine with flex-1 parent
            uploadSectionFlexContainer.style.justifyContent = 'initial'; // Reset justification
            uploadSection.style.padding = ''; // Reset to CSS defined padding (p-4 from HTML)
        }
    });

    // Centralized function to handle file processing and uploading
    async function handleAndUploadFile(file) {
        if (!file) {
            console.warn("handleAndUploadFile: No file provided.");
            return;
        }
        if (file.type !== "application/pdf") {
            alert("Please select or drop a PDF file.");
            // Potentially clear the visual drop state if called from drop event
            fileList.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            return;
        }

        showSpinner(`Uploading ${file.name}...`);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Unknown upload error occurred." }));
                throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
            }
            // const result = await response.json(); // Assuming backend returns {filename: "..."}
            // console.log('File upload successful:', result.filename);
            await loadFileList(); // Refresh the file list
        } catch (err) {
            console.error("Upload error in handleAndUploadFile:", err);
            alert(`Upload failed: ${err.message}`);
        } finally {
            hideSpinner();
        }
    }

    // Upload button triggers file input
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file upload from file input
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            await handleAndUploadFile(e.target.files[0]);
        }
        e.target.value = null; // Reset file input to allow re-uploading the same file
    });

    // Drag and Drop functionality for the file list area
    fileList.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileList.classList.add('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
        console.log('Drag entered file-list');
    });

    fileList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation(); // This is crucial to allow the drop event
        // Optionally add more visual feedback or check file types here if desired
    });

    fileList.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Check if the leave event is not just moving over a child element
        if (e.target === fileList || !fileList.contains(e.relatedTarget)) {
            fileList.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            console.log('Drag left file-list');
        }
    });

    fileList.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileList.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
        console.log('File dropped on file-list');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // We'll process the first dropped file.
            // Could be extended to handle multiple files if the backend supports it or process sequentially.
            await handleAndUploadFile(files[0]);
        }
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
                    li.className = 'file-item cursor-pointer px-3 py-1.5 rounded hover:bg-blue-100 mb-2 flex items-center gap-2'; // Added flex, items-center, gap-2

                    // PDF Icon SVG
                    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    iconSvg.setAttribute('class', 'w-4 h-4 flex-shrink-0');
                    iconSvg.setAttribute('viewBox', '0 0 20 20');
                    iconSvg.innerHTML = '<g><path d="M4 0C2.89543 0 2 0.89543 2 2V18C2 19.1046 2.89543 20 4 20H16C17.1046 20 18 19.1046 18 18V6L12 0H4Z" fill="#FFFFFF" stroke="#4B5563" stroke-width="1"/><path d="M12 0L18 6H12V0Z" fill="#E5E7EB" stroke="#4B5563" stroke-width="0.5"/><text x="5" y="15" font-family="Arial, sans-serif" font-size="6px" font-weight="bold" fill="#B91C1C">PDF</text></g>';
                    
                    li.appendChild(iconSvg);

                    const fileNameSpan = document.createElement('span');
                    fileNameSpan.textContent = filename;
                    fileNameSpan.className = 'break-words text-sm text-gray-700 truncate'; // Truncation styles on the span
                    // Styles for single-line truncation with ellipsis (already applied by truncate)
                    fileNameSpan.style.display = 'block'; // Ensure it takes block for truncation
                    fileNameSpan.style.overflow = 'hidden';
                    fileNameSpan.style.textOverflow = 'ellipsis';
                    fileNameSpan.style.whiteSpace = 'nowrap';
                    // fileNameSpan.style.lineHeight = '1.3em'; // From previous, ensure it aligns well
                    
                    li.appendChild(fileNameSpan);
                    li.title = filename; // Show full name on hover of the whole item

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
                refreshBtn.style.display = 'inline-flex';
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
            refreshBtn.style.display = 'none';
            exportBtn.style.display = 'none';
            isEditingMarkdown = true;
            markdownView.focus();
        }
    });

    // Refresh button functionality
    refreshBtn.addEventListener('click', async () => {
        if (!currentFile || !currentPage) {
            alert("No file or page selected to refresh.");
            return;
        }
        if (isEditingMarkdown) {
            alert("Please save or cancel editing before refreshing.");
            return;
        }

        console.log(`Refreshing page ${currentPage} for file ${currentFile}`);
        showSpinner(`Refreshing page ${currentPage}...`);
        try {
            const response = await fetch(`/force-extract-page/${encodeURIComponent(currentFile)}/${currentPage}`, {
                method: 'POST'
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: "Failed to trigger page re-extraction." }));
                throw new Error(errData.detail);
            }
            // Re-fetch and display the markdown for the current page
            await fetchExtractedMarkdown(currentFile, currentPage);
        } catch (error) {
            console.error("Error refreshing page:", error);
            alert(`Error refreshing page: ${error.message}`);
        } finally {
            hideSpinner();
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
            refreshBtn.style.display = 'inline-flex';
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
                console.error("triggerExtraction: Fetch not ok:", errData.detail);
                throw new Error(errData.detail);
            }
            const data = await response.json();
            console.log('triggerExtraction: Extraction response received from backend:', data);
            highestPageExtractedLocally = Math.max(highestPageExtractedLocally, data.lastPageExtractedInBatch);
            isPdfFullyExtracted = data.isProcessingComplete;
            currentFileTotalPages = data.totalPages;
            return data;
        } catch (error) {
            console.error("Error in triggerExtraction function:", error);
            // Spinner will be hidden by the finally block
            throw error; // Re-throw so it can be caught by callers if necessary
        } finally {
            console.log("triggerExtraction: Entering finally block."); 
            hideSpinner(); 
            console.log("triggerExtraction: hideSpinner() called from finally block."); 
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
        console.log(`Fetching markdown for ${filename}, page ${pageNum}. Highest extracted: ${highestPageExtractedLocally}, Fully extracted: ${isPdfFullyExtracted}`);
        
        markdownView.value = `Loading text for page ${pageNum}...`;
        let data;
        try {
            const response = await fetch(`/extracted-markdown/${encodeURIComponent(filename)}/${pageNum}`);
            if (!response.ok) {
                // Handle non-OK responses that are not necessarily JSON
                const errorText = await response.text().catch(() => `Server error ${response.status}`);
                throw new Error(errorText);
            }
            data = await response.json();
        } catch (error) {
            console.error(`Initial error fetching markdown for page ${pageNum}:`, error);
            markdownView.value = `Error loading extracted text: ${error.message}`;
            // Optional: could try to triggerExtraction here if it was a network error not a 404-like error from backend
            return;
        }

        // Now, handle the response, especially if the file was "not_found"
        if (data.status === 'not_found') {
            console.warn(`Markdown for page ${pageNum} not found by backend. Attempting to trigger extraction.`);
            try {
                await triggerExtraction(filename, pageNum); // This will show spinner for its duration
                
                console.log(`Re-fetching markdown for page ${pageNum} after triggering extraction.`);
                const retryResponse = await fetch(`/extracted-markdown/${encodeURIComponent(filename)}/${pageNum}`);
                if (!retryResponse.ok) {
                    const retryErrorText = await retryResponse.text().catch(() => `Server error ${retryResponse.status}`);
                    throw new Error(retryErrorText);
                }
                const retryData = await retryResponse.json();
                
                if (retryData.status === 'not_found') {
                    markdownView.value = 'No text found on this page (extraction attempted). Might be a blank page.';
                    console.warn(`Markdown for page ${pageNum} still not found after re-extraction attempt.`);
                } else {
                    markdownView.value = retryData.markdown || 'No text extracted for this page (empty after re-extraction).';
                }
            } catch (error) {
                console.error(`Error during or after re-extraction attempt for page ${pageNum}:`, error);
                markdownView.value = `Error processing page ${pageNum}: ${error.message}`;
            }
        } else { // data.status === 'found'
            markdownView.value = data.markdown || 'No text extracted for this page (empty).';
        }
        console.log(`Markdown for page ${pageNum} processing finished.`);
        // Spinner management: 
        // - triggerExtraction handles its own spinner.
        // - The main spinner from loadAndDisplayPdf is handled by its finally block.
        // - No separate spinner for just fetching already extracted markdown is used here to avoid flashing.
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

    // Initial load
    loadFileList();
});