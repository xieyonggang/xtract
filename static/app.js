document.addEventListener('DOMContentLoaded', function() {
    const spinnerModal = document.getElementById('spinner-modal');
    const leftPanel = document.getElementById('left-panel');
    const panelToggle = document.getElementById('panel-toggle');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const middlePanel = document.getElementById('middle-panel');
    const pdfPreview = document.getElementById('pdf-preview');
    const dropZoneHint = document.getElementById('drop-zone-hint');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const gotoPageInput = document.getElementById('goto-page');
    const gotoBtn = document.getElementById('goto-btn');
    const pageInfo = document.getElementById('page-info');
    const contentArea = document.getElementById('content-area');
    const editBtn = document.getElementById('edit-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtnToggle = document.getElementById('export-btn-toggle');
    const exportDropdown = document.getElementById('export-dropdown');
    const exportCurrentTxtBtn = document.getElementById('export-current-txt-btn');
    const exportCurrentDocxBtn = document.getElementById('export-current-docx-btn');
    const exportAllTxtBtn = document.getElementById('export-all-txt-btn');
    const exportAllDocxBtn = document.getElementById('export-all-docx-btn');

    const pencilIconSVG = `<svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`;
    const saveIconSVG = `<svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;

    editBtn.innerHTML = pencilIconSVG;

    let tinymceEditor = null;
    let isEditingContent = false;

    function updateEditorControlsState(disable) {
        const controls = [editBtn, refreshBtn, exportBtnToggle];
        controls.forEach(button => {
            button.disabled = disable;
            if (disable) {
                button.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                button.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
        if (disable) {
            exportDropdown.classList.add('hidden');
        }
        if (tinymceEditor && disable) {
            tinymceEditor.mode.set('readonly');
            isEditingContent = false;
            editBtn.innerHTML = pencilIconSVG;
        }
    }

    updateEditorControlsState(true);

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
    let currentFileTotalPages = 0;
    let highestPageExtractedLocally = 0;
    let isPdfFullyExtracted = false;
    let isPanelCollapsed = false;

    function initEditor(initialContent = '', readonly = true) {
        console.log("Initializing TinyMCE. Readonly:", readonly, "Content:", initialContent.substring(0, 50));
        
        if (tinymce.get('content-area')) {
            console.log("Destroying existing TinyMCE instance.");
            tinymce.get('content-area').destroy();
            tinymceEditor = null;
        }

        tinymce.init({
            selector: '#content-area',
            height: '100%',
            readonly: readonly,
            menubar: false,
            toolbar: false,
            statusbar: false,
            skin_url: '/static/tinymce/skins/ui/oxide',
            skin: 'oxide',
            content_css: '/static/tinymce/skins/content/default/content.min.css',
            plugins: [
                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                'insertdatetime', 'media', 'table', 'help', 'wordcount'
            ],
            content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; transform-origin: top left; } ' +
                           (readonly ? 'body { padding: 10px !important; margin: 0 !important; }' : ''),
            setup: function(editor) {
                editor.on('init', function() {
                    console.log("TinyMCE 'init' event. Setting content.");
                    editor.setContent(initialContent || '');
                    tinymceEditor = editor;
                    if (readonly && editor.getContainer()) {
                        editor.getContainer().style.border = 'none'; 
                    }
                    setTimeout(() => scaleEditorContentToFit(editor), 100); 
                });
                editor.on('SetContent', function() {
                    setTimeout(() => scaleEditorContentToFit(editor), 100); 
                });
                tinymceEditor = editor;
            },
            init_instance_callback: function(editor) {
                console.log("TinyMCE 'init_instance_callback'. Editor ID: " + editor.id + ", Readonly: " + editor.mode.isReadOnly());
                tinymceEditor = editor; 
                if (editor.mode.isReadOnly() && editor.getContainer()) {
                    const container = editor.getContainer();
                    if (container) {
                        container.classList.add('tinymce-readonly-container');
                        editor.getBody().setAttribute('tabindex', '-1');
                    }
                    editor.getBody().style.padding = '10px'; 
                    editor.getBody().style.margin = '0px';

                } else if (editor.getContainer()){
                    editor.getContainer().classList.remove('tinymce-readonly-container');
                }
            }
        });
    }

    function setEditorMode(editing) {
        console.log("setEditorMode called with editing:", editing);
        let currentContent = '';
        if (tinymceEditor) {
            currentContent = tinymceEditor.getContent();
        }

        isEditingContent = editing;
        editBtn.innerHTML = editing ? saveIconSVG : pencilIconSVG;
        
        initEditor(currentContent, !editing); 
    }

    panelToggle.addEventListener('click', () => {
        isPanelCollapsed = !isPanelCollapsed;
        leftPanel.classList.toggle('w-80');
        leftPanel.classList.toggle('w-10');
        leftPanel.classList.toggle('p-4');
        leftPanel.classList.toggle('p-0');
        
        const icon = panelToggle.querySelector('.panel-toggle-icon');
        icon.style.transform = isPanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        
        const fileListElement = document.getElementById('file-list');
        const uploadBtnElement = document.getElementById('upload-btn');
        const uploadSection = document.getElementById('upload-section');
        const uploadSectionFlexContainer = uploadSection.querySelector('.flex');
        
        if (isPanelCollapsed) {
            fileListElement.style.display = 'none';
            uploadBtnElement.style.display = 'none';
            uploadSectionFlexContainer.style.justifyContent = 'center';
            uploadSection.style.padding = '0.5rem';

        } else {
            fileListElement.style.display = 'block';
            uploadBtnElement.style.display = 'block';
            uploadSectionFlexContainer.style.justifyContent = 'initial';
            uploadSection.style.padding = '';
        }
    });

    async function handleAndUploadFile(file) {
        if (!file) {
            console.warn("handleAndUploadFile: No file provided.");
            return null;
        }
        if (file.type !== "application/pdf") {
            alert("Please select or drop a PDF file.");
            const pdfPreviewElement = document.getElementById('pdf-preview');
            fileList.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            pdfPreviewElement.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            return null;
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
            const result = await response.json();
            await loadFileList();
            return result.filename;
        } catch (err) {
            console.error("Upload error in handleAndUploadFile:", err);
            alert(`Upload failed: ${err.message}`);
            return null;
        } finally {
            hideSpinner();
        }
    }

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const uploadedFilename = await handleAndUploadFile(e.target.files[0]);
        }
        e.target.value = null; 
    });

    const dropZoneActiveClass = ['bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed'];

    fileList.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileList.classList.add(...dropZoneActiveClass);
    });

    fileList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    fileList.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === fileList || !fileList.contains(e.relatedTarget)) {
            fileList.classList.remove(...dropZoneActiveClass);
        }
    });

    fileList.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileList.classList.remove(...dropZoneActiveClass);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const uploadedFilename = await handleAndUploadFile(files[0]);
        }
    });

    pdfPreview.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pdfPreview.classList.add(...dropZoneActiveClass);
    });

    pdfPreview.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    pdfPreview.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === pdfPreview || !pdfPreview.contains(e.relatedTarget)) {
            pdfPreview.classList.remove(...dropZoneActiveClass);
        }
    });

    pdfPreview.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        pdfPreview.classList.remove(...dropZoneActiveClass);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const uploadedFilename = await handleAndUploadFile(files[0]);
            if (uploadedFilename) {
                await loadAndDisplayPdf(uploadedFilename);
            }
        }
    });

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
            fileListElement.innerHTML = '';
            if (files.length === 0) {
                fileListElement.innerHTML = '<li class="px-2 py-1 text-gray-500">No files uploaded.</li>';
            } else {
                files.forEach(file => {
                    const listItem = document.createElement('li');
                    listItem.textContent = file;
                    listItem.className = 'px-3 py-2 cursor-pointer hover:bg-gray-100 rounded text-sm text-gray-700 truncate';
                    listItem.addEventListener('click', async () => {
                        if (currentFile === file && pdfDoc) {
                            console.log(`File ${file} is already loaded.`);
                            return;
                        }
                        await loadAndDisplayPdf(file);
                    });
                    fileListElement.appendChild(listItem);
                });
            }
        } catch (error) {
            console.error('loadFileList: Error fetching or processing file list:', error);
            fileListElement.innerHTML = '<li class="px-2 py-1 text-red-600">Failed to load files. See console.</li>';
        }
    }

    async function loadAndDisplayPdf(filename) {
        showSpinner(`Loading ${filename}...`);
        currentFile = filename;
        currentPage = 1;
        pdfDoc = null;
        isPdfFullyExtracted = false;
        highestPageExtractedLocally = 0;
        
        isEditingContent = false;
        editBtn.innerHTML = pencilIconSVG;
        
        initEditor('', true);

        try {
            const response = await fetch(`/file/${filename}`);
            if (!response.ok) throw new Error(`Failed to load PDF: ${response.statusText}`);
            const pdfData = await response.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
            currentFileTotalPages = pdfDoc.numPages;
            pageInfo.textContent = `Page ${currentPage} of ${currentFileTotalPages}`;
            gotoPageInput.max = currentFileTotalPages;
            gotoPageInput.value = currentPage;
            dropZoneHint.style.display = 'none'; 
            await renderPdfPage(currentPage);
            await loadContentForPage(currentPage);
            await triggerExtraction(filename, currentPage); 
            updateEditorControlsState(false);
        } catch (error) {
            console.error("Error loading PDF:", error);
            alert(`Error loading PDF: ${error.message}`);
            currentFile = null;
            dropZoneHint.style.display = 'block';
            updateEditorControlsState(true);
            if (tinymceEditor) tinymceEditor.setContent('');
        } finally {
            hideSpinner();
        }
    }
    
    async function triggerExtraction(filename, pageNumHint) {
        if (!filename) return;
        console.log(`Triggering extraction for ${filename}, page hint: ${pageNumHint}`);
        showSpinner(`Extracting text from ${filename}...`);
        try {
            const response = await fetch(`/extract/${filename}?page_hint=${pageNumHint}`, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Extraction error."}));
                throw new Error(errorData.detail || "Extraction failed");
            }
            const data = await response.json();
            console.log("Extraction response:", data);
            highestPageExtractedLocally = data.lastPageExtractedInBatch || highestPageExtractedLocally;
            isPdfFullyExtracted = data.isProcessingComplete || (highestPageExtractedLocally >= currentFileTotalPages);

            if (data.contentType && data.contentType === 'html') {
                console.log('Extraction provided HTML content type.');
            }
            if (currentPage === pageNumHint && tinymceEditor && tinymceEditor.getContent() === '') {
                 await loadContentForPage(currentPage);
            }
        } catch (error) {
            console.error("Extraction error:", error);
        } finally {
            hideSpinner();
        }
    }

    async function renderPdfPage(pageNum) {
        if (!pdfDoc) return;
        showSpinner(`Rendering page ${pageNum}...`);
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const context = pdfCanvas.getContext('2d');
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            const renderContext = { canvasContext: context, viewport: viewport };
            await page.render(renderContext).promise;
            pageInfo.textContent = `Page ${pageNum} of ${currentFileTotalPages}`;
            currentPage = pageNum;
            gotoPageInput.value = currentPage;
        } catch (error) {
            console.error("Error rendering page:", error);
        } finally {
            hideSpinner();
        }
    }

    async function loadContentForPage(pageNum) {
        if (!currentFile) return;
        
        const loadingMessage = 'Loading content...';
        if (tinymceEditor) {
            tinymceEditor.setContent(loadingMessage);
        } else {
            initEditor(loadingMessage, true); 
        }

        console.log(`Fetching content for ${currentFile}, page ${pageNum}`);
        try {
            const response = await fetch(`/extracted-content/${currentFile}/${pageNum}`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch content: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            console.log("Received content data:", data);
            const htmlContent = data.html_content || '';

            if (tinymceEditor) {
                tinymceEditor.setContent(htmlContent);
            } else {
                console.warn("loadContentForPage: tinymceEditor was not found, re-initializing (should be rare).");
                initEditor(htmlContent, !isEditingContent);
            }

            if (data.status === 'found' || data.status === 'not_found') {
                const htmlContent = data.html_content || '';
                if (tinymceEditor) {
                    tinymceEditor.setContent(htmlContent);
                    tinymceEditor.mode.set(isEditingContent ? 'design' : 'readonly');
                } else {
                    console.warn("loadContentForPage: tinymceEditor not found, initializing now.");
                    initEditor(htmlContent, !isEditingContent);
                }
            } else if (data.status === 'extraction_pending' || !data.html_content) {
                if (tinymceEditor) tinymceEditor.setContent('<p>Text extraction is pending or not yet available for this page. Please wait or try refreshing.</p>');
                else contentArea.value = 'Text extraction is pending...';
                if (!isPdfFullyExtracted && pageNum > highestPageExtractedLocally) {
                    console.log("Content not found, attempting to trigger extraction for this page specifically.");
                    await triggerExtraction(currentFile, pageNum);
                }
            } else {
                 if (tinymceEditor) tinymceEditor.setContent('<p>Error loading content.</p>'); else contentArea.value = 'Error loading content.';
            }
        } catch (error) {
            console.error("Error fetching content:", error);
            if (tinymceEditor) tinymceEditor.setContent(`<p>Error loading content: ${error.message}</p>`); else contentArea.value = `Error: ${error.message}`;
        }
    }

    prevPageBtn.addEventListener('click', async () => {
        if (currentPage > 1) {
            currentPage--;
            await renderPdfPage(currentPage);
            await loadContentForPage(currentPage);
             if (!isPdfFullyExtracted && currentPage > highestPageExtractedLocally) {
                await triggerExtraction(currentFile, currentPage);
            }
        }
    });

    nextPageBtn.addEventListener('click', async () => {
        if (pdfDoc && currentPage < currentFileTotalPages) {
            currentPage++;
            await renderPdfPage(currentPage);
            await loadContentForPage(currentPage);
            if (!isPdfFullyExtracted && currentPage > highestPageExtractedLocally) {
                await triggerExtraction(currentFile, currentPage);
            }
        }
    });
    
    gotoBtn.addEventListener('click', async () => {
        const pageNum = parseInt(gotoPageInput.value);
        if (pdfDoc && pageNum >= 1 && pageNum <= currentFileTotalPages) {
            currentPage = pageNum;
            await renderPdfPage(currentPage);
            await loadContentForPage(currentPage);
            if (!isPdfFullyExtracted && currentPage > highestPageExtractedLocally) {
                await triggerExtraction(currentFile, currentPage);
            }
        } else {
            alert(`Please enter a page number between 1 and ${currentFileTotalPages}.`);
        }
    });

    editBtn.addEventListener('click', async () => {
        if (!currentFile) {
            console.warn("Edit button clicked, but no file loaded.");
            return;
        }
        
        if (!tinymceEditor && !isEditingContent) {
            // This case might happen if PDF loaded but editor init failed silently, or before any content loaded
            // Try to initialize in edit mode if user clicks edit.
            console.warn("Edit clicked, no editor instance, but not in logical edit state. Attempting to init for editing.");
            setEditorMode(true); // This will call initEditor with content='' and readonly=false
            return;
        } else if (!tinymceEditor && isEditingContent){
            // This would be an inconsistent state: logically editing, but no editor. Log and try to recover.
            console.error("Edit clicked: Logically in edit mode, but no editor instance! Attempting to re-init for editing.");
            setEditorMode(true); // Re-init for editing
            return;
        }

        // If we are currently in an editing state (logically, according to isEditingContent)
        if (isEditingContent) { 
            // Then the action is to SAVE (and switch to readonly)
            await saveHtmlContent(); // This will call setEditorMode(false) on success
        } else { 
            // We are currently in readonly state (logically), so the action is to EDIT
            setEditorMode(true); // This will re-init for editing and set isEditingContent = true
        }
    });

    async function saveHtmlContent() {
        if (!currentFile || !tinymceEditor) {
            console.error("saveHtmlContent: No current file or editor.");
            return;
        }
        showSpinner('Saving content...');
        const htmlContent = tinymceEditor.getContent();
        try {
            const response = await fetch(`/save-html/${currentFile}/${currentPage}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: htmlContent })
            });
            if (!response.ok) {
                let errorDetail = `Failed to save content (status ${response.status})`; // Default
                try {
                    const errorData = await response.json();
                    // Try to get a meaningful message from common error structures
                    if (typeof errorData.detail === 'string') {
                        errorDetail = errorData.detail;
                    } else if (typeof errorData.message === 'string') {
                        errorDetail = errorData.message;
                    } else if (typeof errorData.error === 'string') {
                        errorDetail = errorData.error;
                    } else {
                        errorDetail = JSON.stringify(errorData); // Fallback to stringifying the whole object
                    }
                } catch (jsonError) {
                    // If parsing JSON fails, try to get raw text
                    try {
                        const rawTextError = await response.text();
                        if (rawTextError && rawTextError.length < 200) { // Avoid huge HTML pages as error messages
                           errorDetail = rawTextError; 
                        }
                    } catch (textError) {
                        // If all else fails, stick to the default message with status code
                    }
                }
                throw new Error(errorDetail);
            }
            console.log('Content saved successfully.');
            setEditorMode(false); // Switch to readonly mode (minimal UI) after successful save
        } catch (err) {
            console.error("Save error:", err);
            alert(`Save failed: ${err.message}`);
        } finally {
            hideSpinner();
        }
    }

    refreshBtn.addEventListener('click', async () => {
        if (!currentFile) return;
        showSpinner(`Re-extracting page ${currentPage}...`);
        try {
            const response = await fetch(`/force-extract-page/${currentFile}/${currentPage}`, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Force extract failed" }));
                throw new Error(errorData.detail || "Failed to re-extract page content.");
            }
            const data = await response.json();
            console.log("Force extract response:", data);
            if (data.status === 'success') {
                await loadContentForPage(currentPage);
                console.log(`Page ${currentPage} content refreshed.`);
            } else {
                throw new Error(data.message || "Unknown error during refresh.");
            }
        } catch (err) {
            console.error("Refresh error:", err);
            alert(`Refresh failed: ${err.message}`);
        } finally {
            hideSpinner();
        }
    });

    exportBtnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        exportDropdown.classList.toggle('hidden');
    });

    document.body.addEventListener('click', (e) => {
        if (!exportBtnToggle.contains(e.target) && !exportDropdown.contains(e.target)) {
            exportDropdown.classList.add('hidden');
        }
    });
    
    function stripHtml(html) {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }

    exportCurrentTxtBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentFile || !tinymceEditor) return;
        const htmlContent = tinymceEditor.getContent();
        const textContent = stripHtml(htmlContent);
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, `${currentFile}_page${currentPage}.txt`);
        exportDropdown.classList.add('hidden');
    });

    exportCurrentDocxBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentFile || !tinymceEditor) return;
        const htmlContent = tinymceEditor.getContent();
        const textContent = stripHtml(htmlContent);
        
        // Explicitly use window.docx to ensure global scope is checked
        if (typeof window.docx === 'undefined') {
            console.error("DOCX library (window.docx) is not defined. Make sure it is loaded correctly.");
            alert("Error: DOCX export library not loaded.");
            return;
        }

        const doc = new window.docx.Document({
            sections: [{
                properties: {},
                children: [new window.docx.Paragraph({ children: [new window.docx.TextRun(textContent)] })],
            }]
        });

        const blob = await window.docx.Packer.toBlob(doc);
        triggerDownload(blob, `${currentFile}_page${currentPage}.docx`);
        exportDropdown.classList.add('hidden');
    });

    async function getAllPagesHtmlContent() {
        if (!pdfDoc) return '';
        let allHtml = '';
        showSpinner(`Fetching all ${currentFileTotalPages} pages for export...`);
        for (let i = 1; i <= currentFileTotalPages; i++) {
            try {
                console.log(`Export All: Fetching page ${i} of ${currentFileTotalPages}`);
                 const response = await fetch(`/extracted-content/${currentFile}/${i}`);
                 if (response.ok) {
                    const data = await response.json();
                    if (data.html_content) {
                         allHtml += data.html_content + '\\n\\n--- Page Break ---\\n\\n';
                    } else {
                        console.log(`Content for page ${i} not readily available, trying to force extract for export.`);
                        const forceExtractResp = await fetch(`/force-extract-page/${currentFile}/${i}`, { method: 'POST' });
                        if (forceExtractResp.ok) {
                            const forceData = await forceExtractResp.json();
                            if(forceData.status === 'success'){
                                const refreshedContentResp = await fetch(`/extracted-content/${currentFile}/${i}`);
                                if(refreshedContentResp.ok){
                                    const refreshedData = await refreshedContentResp.json();
                                    if(refreshedData.html_content){
                                        allHtml += refreshedData.html_content + '\\n\\n--- Page Break ---\\n\\n';
                                    } else {
                                        allHtml += `<!-- Page ${i}: Content could not be extracted -->\\n\\n--- Page Break ---\\n\\n`;
                                    }
                                }
                            } else {
                                 allHtml += `<!-- Page ${i}: Content could not be extracted (force failed) -->\\n\\n--- Page Break ---\\n\\n`;
                            }
                        } else {
                             allHtml += `<!-- Page ${i}: Content could not be extracted (force endpoint failed) -->\\n\\n--- Page Break ---\\n\\n`;
                        }
                    }
                 } else {
                    allHtml += `<!-- Page ${i}: Error fetching content -->\\n\\n--- Page Break ---\\n\\n`;
                 }
            } catch (err) {
                console.error(`Error fetching page ${i} for export:`, err);
                allHtml += `<!-- Page ${i}: Exception during fetch: ${err.message} -->\\n\\n--- Page Break ---\\n\\n`;
            }
        }
        hideSpinner();
        return allHtml;
    }
    
    exportAllTxtBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentFile || !pdfDoc) return;
        const allHtmlContent = await getAllPagesHtmlContent();
        const allTextContent = stripHtml(allHtmlContent.replace(/\\n\\n--- Page Break ---\\n\\n/g, '\\n\\n'));
        const blob = new Blob([allTextContent], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, `${currentFile}_all_pages.txt`);
        exportDropdown.classList.add('hidden');
    });

    exportAllDocxBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentFile || !pdfDoc) return;
        const allHtmlContent = await getAllPagesHtmlContent();
        const allTextContentForDocx = stripHtml(allHtmlContent.replace(/\\n\\n--- Page Break ---\\n\\n/g, '\\n\\n')); 

        // Explicitly use window.docx
        if (typeof window.docx === 'undefined') {
            console.error("DOCX library (window.docx) is not defined for all pages export. Make sure it is loaded correctly.");
            alert("Error: DOCX export library not loaded.");
            return;
        }

        const paragraphs = allTextContentForDocx.split('\\n').map(textLine => 
            new window.docx.Paragraph({ children: [new window.docx.TextRun(textLine)] })
        );

        const doc = new window.docx.Document({
            sections: [{
                properties: {},
                children: paragraphs.length > 0 ? paragraphs : [new window.docx.Paragraph({ children: [new window.docx.TextRun('')] })] // Ensure at least one paragraph for empty docs
            }]
        });
        const blob = await window.docx.Packer.toBlob(doc);
        triggerDownload(blob, `${currentFile}_all_pages.docx`);
        exportDropdown.classList.add('hidden');
    });

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    loadFileList();
    
    if (!contentArea) console.error("CRITICAL: #content-area (markdownView) not found on DOMContentLoaded");
    if (!editBtn) console.error("CRITICAL: #edit-btn not found on DOMContentLoaded");

    // New function to dynamically scale editor content
    function scaleEditorContentToFit(editor) {
        if (!editor || editor.isHidden() || !editor.getDoc() || !editor.getDoc().body) {
            // console.log("scaleEditorContentToFit: Editor not ready or hidden.");
            return;
        }

        const iframeDoc = editor.getDoc();
        const contentBody = iframeDoc.body;

        // Reset scale to measure natural dimensions
        contentBody.style.transform = 'scale(1)';
        contentBody.style.width = 'auto'; // Allow natural width based on content
        contentBody.style.height = 'auto'; // Allow natural height
        // It might be better to get the first child of the body if PyMuPDF wraps page content in a div
        let contentRoot = contentBody.firstChild;
        while(contentRoot && contentRoot.nodeType !== 1) { // Find first element node
            contentRoot = contentRoot.nextSibling;
        }
        if (!contentRoot) contentRoot = contentBody; // Fallback to body if no element child

        const contentWidth = contentRoot.scrollWidth;
        const contentHeight = contentRoot.scrollHeight;

        if (contentWidth === 0 || contentHeight === 0) {
            // console.log("scaleEditorContentToFit: Content dimensions are zero.");
            return;
        }

        const editorContainerElement = editor.getContainer();
        if (!editorContainerElement) {
            // console.log("scaleEditorContentToFit: Editor container not found.");
            return;
        }
        
        // Use clientWidth/Height of the editor element that actually holds the iframe view
        const toxEditorFrame = editorContainerElement.querySelector('.tox-edit-area iframe');
        let availableWidth, availableHeight;
        if(toxEditorFrame && toxEditorFrame.parentElement) { // tox-edit-area is the direct parent usually
            availableWidth = toxEditorFrame.parentElement.clientWidth;
            availableHeight = toxEditorFrame.parentElement.clientHeight;
        } else {
            availableWidth = editorContainerElement.clientWidth; // Fallback
            availableHeight = editorContainerElement.clientHeight;
        }

        const padding = 5; // Small padding within the viewing area
        const effectiveContainerWidth = Math.max(0, availableWidth - (2 * padding));
        const effectiveContainerHeight = Math.max(0, availableHeight - (2 * padding));

        if (effectiveContainerWidth <= 0 || effectiveContainerHeight <= 0) {
            // console.log("scaleEditorContentToFit: Effective container dimensions are zero or negative.");
            return;
        }

        let scale = 1.0;
        const scaleX = effectiveContainerWidth / contentWidth;
        const scaleY = effectiveContainerHeight / contentHeight;
        scale = Math.min(scaleX, scaleY); 
        
        scale = Math.min(1.0, Math.max(0.05, scale)); // Prevent extreme scales, allow smaller if needed.

        // console.log(`Scaling: Container(${effectiveContainerWidth.toFixed(0)}x${effectiveContainerHeight.toFixed(0)}), Content(${contentWidth}x${contentHeight}), Calculated Scale: ${scale.toFixed(3)}`);
        
        // Apply scale to the content body of the iframe
        contentBody.style.transformOrigin = 'top left';
        contentBody.style.transform = `scale(${scale})`;
        
        // If using a wrapper div approach for content inside body, scale that div instead.
        // For now, scaling the whole body.
        // After scaling, the body itself might be smaller than the iframe, which is fine.
        // We want the *content within the body* to be scaled to fit.
    }

});