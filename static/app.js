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

    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 1;
    let currentFile = null;

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

    // Load and render PDF using PDF.js
    async function loadAndRenderPDF(filename) {
        console.log('loadAndRenderPDF called for:', filename);
        currentFile = filename;
        const url = `/file/${encodeURIComponent(filename)}`;

        // Check if pdfjsLib is available
        console.log('Checking for pdfjsLib. typeof window.pdfjsLib:', typeof window.pdfjsLib);
        console.log('window.pdfjsLib value:', window.pdfjsLib);
        
        // Attempt to use the global pdfjsLib, also checking globalThis as a fallback
        const pdfjsViewer = window.pdfjsLib || globalThis.pdfjsLib;

        if (!pdfjsViewer || typeof pdfjsViewer.getDocument !== 'function') {
            console.error('PDF.js library (pdfjsLib) is NOT loaded correctly or getDocument method is missing.');
            console.error('Detected pdfjsViewer type:', typeof pdfjsViewer);
            if(pdfjsViewer) {
                console.error('Detected pdfjsViewer.getDocument type:', typeof pdfjsViewer.getDocument);
            }
            alert('Critical Error: PDF library (PDF.js) failed to load. Cannot display PDFs. Please check the browser console for errors related to "pdf.min.js" or "pdf.worker.min.js" loading from the CDN (cdnjs.cloudflare.com).');
            return;
        }

        try {
            console.log('PDF.js library appears to be available. Proceeding to load PDF.');
            
            // The workerSrc should now be correctly set by the script in index.html
            // pdfjsViewer.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js`; // REMOVED THIS LINE
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
            alert(`Failed to load or render PDF: ${filename}. An error occurred. Check console for detailed error message.`);
            const context = pdfCanvas.getContext('2d');
            if (context) context.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            pageInfo.textContent = 'Failed to load PDF';
            pdfDoc = null;
        }
    }

    async function renderPage(pageNum) {
        if (!pdfDoc) {
            console.warn("renderPage called but pdfDoc is null or undefined.");
            pageInfo.textContent = 'Error: PDF document not loaded.';
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
        } catch (error) {
            console.error(`Error rendering page ${pageNum} for PDF "${currentFile}":`, error);
            alert(`Error rendering page ${pageNum}. Check console for details.`);
            pageInfo.textContent = `Error rendering page ${pageNum}`;
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