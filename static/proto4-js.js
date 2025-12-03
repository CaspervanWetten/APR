function generateUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const ws = new WebSocket("ws://145.90.76.152:8080/ws/" + (crypto.randomUUID ? crypto.randomUUID() : generateUUIDFallback()));
const tbody = document.getElementById("pv-table-body");
const retryInFlight = new Set();
let noneSeen = false;
let currentData = null;
let logs = null;
let currentThoughtBubbles = [];
let activeThoughtIndex = -1;
let reportTextArea = null; // Will store a reference to the main report textarea
let currentThoughtBubblesElements = []; // Store references to the actual DOM elements

// ==============
// UPLOAD AND RETRY FORM
// ==============
function showUploadForm(filenameToRetry = null) {
  const isRetry = !!filenameToRetry;

  if (isRetry && retryInFlight.has(filenameToRetry)) {
    return;
  }

  // Create the upload popup
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.backgroundColor = "white";
  popup.style.padding = "20px";
  popup.style.border = "1px solid #ccc";
  popup.style.borderRadius = "8px";
  popup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  popup.style.zIndex = "2000";
  popup.style.minWidth = "300px";

  // Popup content
  popup.innerHTML = `
    <h5>${isRetry ? `Retry Options for ${filenameToRetry}` : 'Select Upload Options'}</h5>
    ${isRetry ? '' : `
    <div class="mb-3">
      <label for="popup_file_input" class="form-label">File</label>
      <input type="file" id="popup_file_input" class="form-control">
    </div>
    `}
    <div class="form-check mb-3">
      <input class="form-check-input" type="checkbox" id="boolCheck">
      <label class="form-check-label" for="boolCheck">
        Operationele data?
      </label>
    </div>
    <div class="mb-3">
      <label for="modelSelect" class="form-label">Select Model</label>
      <select id="modelSelect" class="form-select">
        <!-- options will be populated dynamically -->
      </select>
    </div>
    <div class="d-flex justify-content-end">
      <button id="popupSubmitBtn" class="btn btn-primary me-2">Submit</button>
      <button id="popupCancelBtn" class="btn btn-secondary">Cancel</button>
    </div>
  `;

  // Append popup to body
  document.body.appendChild(popup);

  // Populate model dropdown based on checkbox
  const modelSelect = popup.querySelector("#modelSelect");
  const boolCheck = popup.querySelector("#boolCheck");
  const updateModelOptions = () => {
    modelSelect.innerHTML = ""; // Clear existing options
    const options = boolCheck.checked
      ? ["DeepSeek-R1-Quantized-Qwen"]
      : ["gpt-4o", "DeepSeek-R1-Quantized-Qwen"];

    options.forEach((model) => {
      const opt = document.createElement("option");
      opt.value = model;
      opt.textContent = model;
      modelSelect.appendChild(opt);
    });
  };
  boolCheck.addEventListener("change", updateModelOptions);
  updateModelOptions(); // Initial population

  // Handle submission
  popup.querySelector("#popupSubmitBtn").addEventListener("click", () => {
    const config = {
      advanced: boolCheck.checked,
      model: modelSelect.value,
    };

    if (isRetry) {
      retryInFlight.add(filenameToRetry);
      const tr = tbody.querySelector(`tr[data-filename="${filenameToRetry}"]`);
      if (tr) {
        tr.children[1].textContent = "";
        tr.children[2].innerHTML = `
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span class="ms-2">working</span>
        `;
      }
      ws.send(JSON.stringify({
          action: "pv-individual-retry",
          file: filenameToRetry,
          config: config
      }));
      popup.remove();
    } else {
      const popupFileInput = popup.querySelector("#popup_file_input");
      const file = popupFileInput.files[0];
      if (!file) {
        alert("Please select a file.");
        return;
      }

      const UUID = crypto.randomUUID ? crypto.randomUUID() : generateUUIDFallback();
      config.UUID = UUID;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("config", JSON.stringify(config));

      fetch(`/upload/${UUID}`, {
        method: "POST",
        body: formData,
      })
        .then(() => {
          sessionStorage.setItem("uuid", UUID);
          ws.send(JSON.stringify({ action: "table-update" }));
          popup.remove();
        })
        .catch((err) => {
          console.error("Upload failed", err);
          alert("Upload failed. See console.");
        });
    }
  });

  // Cancel button
  popup.querySelector("#popupCancelBtn").addEventListener("click", () => {
    popup.remove();
  });
}

// ==============
// INDIVIDUAL FILE RETRYING
// ==============
function retryFile(file) {
  showUploadForm(file);
}

// ===============
// TABLE RENDERER
// ===============
function renderTable(data) {
  // clear out old rows
  tbody.innerHTML = "";
  noneSeen = false;

  // if server says “none”
  if (data === "none") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="4" class="text-center">
        Er zijn geen eerdere PVs gevonden.
      </td>
    `;
    tbody.appendChild(tr);
    noneSeen = true;
    return;
  }

  // otherwise, loop through items
  data.forEach((item) => {
    if (
      retryInFlight.has(item.filename) &&
      (item.status === "done" || item.status === "error")
    ) {
      retryInFlight.delete(item.filename);
    }

    const tr = document.createElement("tr");
    const tdFilename = document.createElement("td");
    const tdDate = document.createElement("td");
    const tdModel = document.createElement("td");
    const tdAction = document.createElement("td");

    tdFilename.className = "th-id";
    tdFilename.textContent = item.filename;
    tr.dataset.filename = item.filename;
    tdDate.textContent = item.created_at;
    tdDate.className = "th";

    tdModel.textContent = item.model;
    tdModel.className = "th";

    // Match on status values
    switch (item.status) {
      case "done":
        const viewBtn = createViewButton(item);
        const deleteBtn = createDeleteButton(item, tdAction);

        tdAction.appendChild(viewBtn);
        tdAction.appendChild(deleteBtn);
        break;

      case "working":
        tdAction.appendChild(createSpinner());
        tdAction.appendChild(createStatusText(item.status));
        tdAction.appendChild(createCancelButton(item, tdAction));
        break;

      case "aLog":
        const viewLogBtn = createViewALogsButton(item);
        tdAction.appendChild(viewLogBtn);
        break;

      case "tLog":
        const viewTLogBtn = createViewTLogsButton(item);
        tdAction.appendChild(viewTLogBtn);
        break;

      case "error":
        const retryBtn = createRetryButton(item);
        const deleteErrorFileBtn = createDeleteErrorButton(item, tdAction);
        tdAction.appendChild(deleteErrorFileBtn);
        tdAction.appendChild(retryBtn);
        break;

      default:
        // If status is unknown, just show the status without any special action
        tdAction.innerHTML = `<span class="ms-2">unknown item with status: <strong>${item.status}</strong></span>`;
    }

    tr.append(tdFilename, tdDate, tdModel, tdAction);
    tbody.appendChild(tr);
  });
}

/// =============
/////// Word Interface Modal (Proto4)
/// =============

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

const debouncedSendMetadataUpdate = debounce(sendMetadataUpdate, 500);
const debouncedTriggerThoughtGeneration = debounce(triggerThoughtGeneration, 1000);

function attachUpdateListeners(container) {
    const textareas = container.querySelectorAll('textarea:not([data-listener-attached])');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', debouncedSendMetadataUpdate);
        textarea.addEventListener('blur', sendMetadataUpdate);
        textarea.dataset.listenerAttached = 'true';
    });
}

function sendMetadataUpdate() {
    const modal = document.getElementById('word-interface-modal');
    if (!modal.dataset.filename) return;

    const filename = modal.dataset.filename;
    const procesVerbaal = reportTextArea ? reportTextArea.value.trim() : "";

    const updateData = {
        ID: filename,
        proces_verbaal: procesVerbaal
    };

    // Extract preamble data
    modal.querySelectorAll('.preamble-input').forEach(input => {
        const field = input.dataset.field;
        updateData[field] = input.value.trim();
    });

    ws.send(JSON.stringify({
        action: 'update-pv-information',
        currentData: updateData
    }));
}

function createReportTextArea(content = '') {
    const textArea = document.createElement('textarea');
    textArea.className = 'report-area form-control p-2';
    textArea.ondragover = (event) => allowDrop(event);
    textArea.ondrop = (event) => drop(event, textArea);
    textArea.placeholder = "Begin hier met het typen van uw rapport...";
    textArea.value = content;
    textArea.addEventListener('input', debouncedTriggerThoughtGeneration); // Trigger thoughts on input
    return textArea;
}

function showWordInterface(item) {
    const wordModalEl = document.getElementById('word-interface-modal');
    if (!wordModalEl) return;
    const wordModal = new bootstrap.Modal(wordModalEl);
    
    wordModalEl.dataset.filename = item.filename;
    wordModal.show();

    const reportColumn = document.getElementById('report-column');
    const reportEditor = document.getElementById('report-editor');
    const thoughtBubblesContainer = document.getElementById('thought-bubbles-container');

    // Clear previous thoughts
    thoughtBubblesContainer.innerHTML = '';
    currentThoughtBubbles = [];
    activeThoughtIndex = -1;

    // Preamble setup
    const existingPreamble = reportColumn.querySelector('.report-preamble');
    if (existingPreamble) {
        existingPreamble.remove();
    }

    const preAmble = document.createElement('div');
    preAmble.className = 'report-preamble';
    preAmble.innerHTML = `
        <h5>Report for: ${item.original_filename || item.filename}</h5>
        <p class="text-muted">Created on: ${new Date(item.created_at).toLocaleString()}</p>
        <hr>
        <h6>Details</h6>
        <div class="preamble-fields">
            <label><strong>Datum:</strong></label><textarea class="preamble-input form-control mb-2" data-field="datum">${item.datum || ''}</textarea>
            <label><strong>Tijd:</strong></label><textarea class="preamble-input form-control mb-2" data-field="tijd">${item.tijd || ''}</textarea>
            <label><strong>Locatie:</strong></label><textarea class="preamble-input form-control mb-2" data-field="locatie">${item.locatie || ''}</textarea>
            <label><strong>Verdachte:</strong></label><textarea class="preamble-input form-control mb-2" data-field="verdachte">${item.verdachte || ''}</textarea>
        </div>
        <hr>
    `;
    reportColumn.insertBefore(preAmble, reportEditor);
    attachUpdateListeners(preAmble);

    // Report Area setup
    // Clear it out first, but preserve the thought-bubbles-container
    const currentThoughtContainer = reportEditor.querySelector('#thought-bubbles-container');
    reportEditor.innerHTML = ''; 
    reportEditor.appendChild(currentThoughtContainer);


    const reportContent = item.proces_verbaal ? item.proces_verbaal.trim() : '';
    reportTextArea = createReportTextArea(reportContent); // Assign to global variable
    reportEditor.insertBefore(reportTextArea, thoughtBubblesContainer); // Insert before the thought container
    attachUpdateListeners(reportEditor);

    // Initial thoughts generation
    if (reportContent) {
        triggerThoughtGeneration();
    }

    // Keyboard navigation for thought bubbles
    if (reportTextArea) {
        reportTextArea.addEventListener('keydown', handleThoughtKeyboardNavigation);
    }
    
    // Attach generate PDF handler (ensure it's not duplicated if already attached via DOMContentLoaded)
    const generateBtn = document.getElementById('generate-pdf-btn');
    if (generateBtn) {
        generateBtn.removeEventListener('click', generateAndDownloadPdf); // Prevent duplicate listeners
        generateBtn.addEventListener('click', generateAndDownloadPdf);
    }

    // The 'Blocks' action from proto3 is not relevant here for proto4's thought bubbles.
    // However, if the backend still expects it for some reason, keep it.
    // For now, I'll assume LLM thoughts are triggered by user input in the report area.
    // ws.send(JSON.stringify({
    //     action: "Blocks",
    //     filename: item.filename
    // }));
}

function populateThoughtBubbles(thoughts) {
    const thoughtBubblesContainer = document.getElementById('thought-bubbles-container');
    // Clear previous thoughts but preserve the container itself
    while (thoughtBubblesContainer.firstChild) {
        thoughtBubblesContainer.removeChild(thoughtBubblesContainer.firstChild);
    }
    currentThoughtBubbles = thoughts;
    activeThoughtIndex = -1; // Reset active thought
    currentThoughtBubblesElements = []; // Reset stored DOM elements

    if (!thoughts || thoughts.length === 0) {
        return;
    }

    const occupiedPositions = []; // Store occupied positions (x, y, width, height)

    thoughts.forEach((thought, index) => {
        const thoughtBubble = document.createElement('div');
        thoughtBubble.className = 'thought-bubble';
        thoughtBubble.textContent = thought;
        thoughtBubble.tabIndex = 0; // Make it focusable
        thoughtBubble.dataset.index = index;
        thoughtBubble.draggable = true; // Make it draggable

        // Add to the container immediately to get its size
        thoughtBubblesContainer.appendChild(thoughtBubble);

        const bubbleRect = thoughtBubble.getBoundingClientRect(); // Get actual dimensions after adding to DOM
        const bubbleWidth = bubbleRect.width;
        const bubbleHeight = bubbleRect.height;

        let collision;
        let randomLeft, randomTop;
        let attempts = 0;
        const maxAttempts = 100; // Prevent infinite loop for positioning

        // Use viewport dimensions for positioning
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Try to find a non-overlapping position
        do {
            collision = false;
            // Generate random positions within a safe area of the viewport
            // Avoid extreme edges and the report modal area
            const safePadding = 50; // Pixels from edges
            randomLeft = Math.random() * (viewportWidth - bubbleWidth - 2 * safePadding) + safePadding;
            randomTop = Math.random() * (viewportHeight - bubbleHeight - 2 * safePadding) + safePadding;

            const newRect = {
                left: randomLeft,
                top: randomTop,
                right: randomLeft + bubbleWidth,
                bottom: randomTop + bubbleHeight
            };

            for (const existingRect of occupiedPositions) {
                if (!(newRect.left > existingRect.right ||
                      newRect.right < existingRect.left ||
                      newRect.top > existingRect.bottom ||
                      newRect.bottom < existingRect.top)) {
                    collision = true;
                    break;
                }
            }
            attempts++;
        } while (collision && attempts < maxAttempts);

        thoughtBubble.style.left = `${randomLeft}px`;
        thoughtBubble.style.top = `${randomTop}px`;
        occupiedPositions.push({
            left: randomLeft,
            top: randomTop,
            right: randomLeft + bubbleWidth,
            bottom: randomTop + bubbleHeight
        });


        let isDragging = false;
        let offsetX, offsetY;

        // Make thought bubbles draggable
        thoughtBubble.addEventListener('mousedown', (e) => {
            isDragging = true;
            thoughtBubble.style.cursor = 'grabbing';
            offsetX = e.clientX - thoughtBubble.getBoundingClientRect().left;
            offsetY = e.clientY - thoughtBubble.getBoundingClientRect().top;
            thoughtBubble.style.transition = 'none'; // Disable transition during drag
            thoughtBubble.classList.add('dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent text selection during drag
            thoughtBubble.style.left = `${e.clientX - offsetX}px`;
            thoughtBubble.style.top = `${e.clientY - offsetY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                thoughtBubble.style.cursor = 'grab';
                thoughtBubble.style.transition = 'transform 0.2s ease, background-color 0.2s ease'; // Re-enable transition
                thoughtBubble.classList.remove('dragging');

                // Check if dropped onto the reportTextArea
                const reportRect = reportTextArea.getBoundingClientRect();
                const bubbleRectAfterDrag = thoughtBubble.getBoundingClientRect();

                if (
                    bubbleRectAfterDrag.left < reportRect.right &&
                    bubbleRectAfterDrag.right > reportRect.left &&
                    bubbleRectAfterDrag.top < reportRect.bottom &&
                    bubbleRectAfterDrag.bottom > reportRect.top
                ) {
                    insertThoughtIntoReport(thought, thoughtBubble); // Pass bubble for removal
                }
            }
        });

        // Click to insert (if not dragging)
        thoughtBubble.addEventListener('click', () => {
            if (!isDragging) {
                insertThoughtIntoReport(thought, thoughtBubble); // Pass bubble for removal
            }
        });

        thoughtBubble.addEventListener('focus', () => {
            // Remove active-thought from previously active element
            if (activeThoughtIndex !== -1 && currentThoughtBubblesElements[activeThoughtIndex]) {
                currentThoughtBubblesElements[activeThoughtIndex].classList.remove('active-thought');
            }
            thoughtBubble.classList.add('active-thought');
            activeThoughtIndex = index;
        });

        thoughtBubble.addEventListener('blur', () => {
            thoughtBubble.classList.remove('active-thought');
        });
        currentThoughtBubblesElements.push(thoughtBubble);
    });
}

function insertThoughtIntoReport(thought, thoughtBubbleElement = null) {
    if (!reportTextArea) return;

    const startPos = reportTextArea.selectionStart;
    const endPos = reportTextArea.selectionEnd;
    const currentText = reportTextArea.value;

    reportTextArea.value = currentText.substring(0, startPos) + thought + currentText.substring(endPos, currentText.length);

    // Move cursor after the inserted text
    reportTextArea.selectionStart = startPos + thought.length;
    reportTextArea.selectionEnd = startPos + thought.length;

    reportTextArea.focus();
    sendMetadataUpdate(); // Save the updated report
    showPopup("Gedachtenbubbel verplaatst naar rapport!", "#28a745"); // Dutch popup

    // Remove the thought bubble if it was used
    if (thoughtBubbleElement && thoughtBubbleElement.parentNode) {
        thoughtBubbleElement.parentNode.removeChild(thoughtBubbleElement);
        // Remove from currentThoughtBubblesElements
        const index = currentThoughtBubblesElements.indexOf(thoughtBubbleElement);
        if (index > -1) {
            currentThoughtBubblesElements.splice(index, 1);
            // Re-index if necessary (for keyboard navigation)
            currentThoughtBubblesElements.forEach((el, idx) => el.dataset.index = idx);
        }
    }
}

function triggerThoughtGeneration() {
    const modal = document.getElementById('word-interface-modal');
    if (!modal.dataset.filename || !reportTextArea) return;

    const currentText = reportTextArea.value;
    const preambleData = {};
    modal.querySelectorAll('.preamble-input').forEach(input => {
        const field = input.dataset.field;
        preambleData[field] = input.value.trim();
    });

    if (currentText.trim().length < 20) { // Only generate thoughts if enough text is present
        populateThoughtBubbles([]); // Clear thoughts if text is too short
        return;
    }
    
    // Combine report text and preamble data for context
    const fullContext = {
        ...preambleData,
        proces_verbaal: currentText
    };

    ws.send(JSON.stringify({
        action: 'requested-thought', // New action for thought generation
        filename: modal.dataset.filename,
        context: fullContext // Send all metadata
    }));
}


function allowDrop(event) {
    event.preventDefault();
}

function drop(event, element) {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");

    if (element.tagName === 'TEXTAREA') {
        const startPos = element.selectionStart;
        const endPos = element.selectionEnd;
        const currentText = element.value;

        element.value = currentText.substring(0, startPos) + data + currentText.substring(endPos, currentText.length);

        element.selectionStart = startPos + data.length;
        element.selectionEnd = startPos + data.length;

        element.focus();
    } else {
        console.error("Drop target is not a textarea.");
    }
}

function generateAndDownloadPdf() {
    const modal = document.getElementById('word-interface-modal');
    const filename = modal.dataset.filename;
    const procesVerbaal = reportTextArea ? reportTextArea.value.trim() : "";

    if (procesVerbaal) {
        const updateData = {
            ID: filename,
            proces_verbaal: procesVerbaal
        };
        // Also add preamble data for PDF generation if needed
        modal.querySelectorAll('.preamble-input').forEach(input => {
            const field = input.dataset.field;
            updateData[field] = input.value.trim();
        });


        ws.send(JSON.stringify({
            action: 'update-and-generate-pdf',
            data: updateData
        }));

        showPopup("📄 Generating PDF...", "#0dcaf0");
    } else {
        showPopup("❌ Report is empty", "#dc3545");
    }
}

/// ==============
/// Button functionality
/// =============
function createViewButton(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-primary mb-3";
  btn.textContent = "View";
  btn.addEventListener("click", () => showWordInterface(item));
  return btn;
}

function createDeleteButton(item, tdAction) {
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-danger mb-3 ms-2";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => handleDelete(item, tdAction));
  return deleteBtn;
}

function handleDelete(item, tdAction) {
  tdAction.innerHTML = `
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Deleting...</span>
    </div>
    <span class="ms-2">verwijderen...</span>
  `;

  ws.send(JSON.stringify({ action: "delete-pv", filename: item.filename }));

  setTimeout(() => {
    ws.send(JSON.stringify({ action: "table-update" }));
  }, 2000);
}

function createCancelButton(item, tdAction) {
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-warning btn-sm ms-3";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => handleCancel(item, tdAction));
  return cancelBtn;
}

function handleCancel(item, tdAction) {
  tdAction.innerHTML = `
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Cancelling...</span>
    </div>
    <span class="ms-2">cancelling...</span>
  `;

  ws.send(
    JSON.stringify({
      action: "cancel-task",
      filename: item.filename,
    })
  );

  console.log("Cancel sent for", item.filename);
}

function createRetryButton(item) {
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn btn-danger mb-3";
  retryBtn.textContent = "Retry";
  retryBtn.addEventListener("click", () => retryFile(item.filename));
  return retryBtn;
}

function createDeleteErrorButton(item, tdAction) {
  const deleteErrorFileBtn = document.createElement("button");
  deleteErrorFileBtn.type = "button";
  deleteErrorFileBtn.className = "btn btn-danger mb-3 ms-2";
  deleteErrorFileBtn.textContent = "Delete";
  deleteErrorFileBtn.addEventListener("click", () =>
    handleErrorDelete(item, tdAction)
  );
  return deleteErrorFileBtn;
}

function handleErrorDelete(item, tdAction) {
  tdAction.innerHTML = `
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Deleting...</span>
    </div>
    <span class="ms-2">verwijderen...</span>
  `;

  ws.send(
    JSON.stringify({
      action: "delete-unfinished-pv",
      filename: item.filename,
    })
  );

  console.log("Delete error file sent for", item.filename);
}

function createSpinner() {
  const spinner = document.createElement("div");
  spinner.className = "spinner-border spinner-border-sm";
  spinner.role = "status";
  spinner.innerHTML = `<span class="visually-hidden">Loading...</span>`;
  return spinner;
}

function createStatusText(status) {
  const statusText = document.createElement("span");
  statusText.className = "ms-2";
  statusText.textContent = status;
  return statusText;
}

function createViewTLogsButton(item) {
  const viewTLogs = document.createElement("button");
  viewTLogs.type = "button";
  viewTLogs.className = "btn btn-info mb-3";
  viewTLogs.textContent = "View Logs";
  viewTLogs.addEventListener("click", () =>
    showTLogsModal(item, [createCloseButton()])
  );
  return viewTLogs;
}

function createViewALogsButton(item) {
  const viewALogs = document.createElement("button");
  viewALogs.type = "button";
  viewALogs.className = "btn btn-info mb-3";
  viewALogs.textContent = "View Logs";
  viewALogs.addEventListener("click", () =>
    showALogsModal(item, [createCloseButton()], {
      rollingWindow: 10,
      promptCharLimit: 100,
      maxModalBodyVh: 70,
    })
  );
  return viewALogs;
}



/// =============
/// Shared helper functions
/// ============
function showPopup(message, bgColor = "#28a745") {
  const popup = document.createElement("div");
  popup.textContent = message;
  Object.assign(popup.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    backgroundColor: bgColor,
    color: "white",
    padding: "10px 16px",
    borderRadius: "5px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    fontSize: "16px",
    zIndex: "2000",
    opacity: "1",
    transition: "opacity 1s ease",
  });

  document.body.appendChild(popup);
  setTimeout(() => {
    popup.style.opacity = "0";
    setTimeout(() => popup.remove(), 1800);
  }, 2500);
}

// ===============
// Download PV
// ===============
function downloadPDF(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

// ===============
// WEBSOCKET SETUP
// ===============
ws.addEventListener("open", () => {
  console.log("WebSocket connection opened");
  ws.send(JSON.stringify({ action: "connection" }));
  // heartbeat every 5s
  setInterval(() => {
    ws.send(JSON.stringify({ action: "heartbeat" }));
    console.log("Sent heartbeat");
  }, 5_000);
});

ws.addEventListener("message", ({ data: raw }) => {
  const data = JSON.parse(raw);

  switch (data.response) {
    case "connected":
      console.log("connected");
      break;

    case "heartbeat":
      console.log("Received heartbeat");
      // re-fetch the PV list on every heartbeat
      ws.send(JSON.stringify({ action: "table-update" }));
      break;

    case "table-update":
      // renderTable handles both “none” and actual arrays
      renderTable(data.data);
      break;

    case "thought-suggestions": // New case for LLM generated thoughts
        populateThoughtBubbles(data.data);
        break;

    case "logs-update":
      // renderTable handles both “none” and actual arrays
      console.log(data.data);
      break;

    case "report":
      setTimeout(() => {
        downloadPDF(data.data);
      }, 2000);
      break;

    case "error":
      console.error("Server error:", data.data);
      break;

    default:
      console.warn("Unexpected response:", data.response);
  }
});

// also trigger an initial table load if WS is already open
window.addEventListener("DOMContentLoaded", () => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "table-update" }));
  } else {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "table-update" }));
    });
  }

  // Set active link in sidebar
  const currentPath = window.location.pathname;
  const sidebarLinks = document.querySelectorAll(".sidebar .nav-link");

  let activeSet = false;
  sidebarLinks.forEach(link => {
      const linkPath = link.getAttribute('href');
      if (linkPath === currentPath) {
          link.classList.add("active");
          activeSet = true;
      }
  });

  // If no exact match, try to find a base match (e.g. for /)
  if (!activeSet && currentPath === '/') {
      const dashboardLink = document.querySelector('.sidebar .nav-link[href="/APR"]');
      if (dashboardLink) {
          dashboardLink.classList.add("active");
      }
  }

  // Attach generate PDF handler
  const generateBtn = document.getElementById('generate-pdf-btn');
  if (generateBtn) {
      generateBtn.addEventListener('click', generateAndDownloadPdf);
  }
});

// ===============
// UPLOAD FORM LOGIC
// ===============
function saveConfig(event) {
  event.preventDefault();
  showUploadForm();
}