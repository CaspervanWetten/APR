const ws = new WebSocket("ws://localhost:8080/ws/APR");
const tbody = document.getElementById("pv-table-body");
const retryInFlight = new Set();
let noneSeen = false;
let currentData = null;

// ==============
// INDIVIDUAL FILE RETRYING
// ==============
function retryFile(file) {
  if (retryInFlight.has(file)) {
    return;
  }

  retryInFlight.add(file);
  // find the row
  const tr = tbody.querySelector(`tr[data-filename="${file}"]`);
  if (tr) {
    tr.children[1].textContent = "";
    tr.children[2].innerHTML = `
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="ms-2">working</span>
    `;
  }
  ws.send(JSON.stringify({ action: "pv-individual-retry", file }));
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

    tr.dataset.filename = item.filename;
    tdFilename.textContent = item.filename;
    tdFilename.className = "th-id";
    tdModel.textContent = item.model;

    // Match on status values
    switch (item.status) {
      case "done":
        tdDate.textContent = item.created_at;

        // Create the View button
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary mb-3";
        btn.textContent = "View";

        // Modal container (only create once)
        let modal = document.getElementById("textEditorModal");
        if (!modal) {
          modal = document.createElement("div");
          modal.id = "textEditorModal";
          modal.style.position = "fixed";
          modal.style.top = "50%";
          modal.style.left = "50%";
          modal.style.transform = "translate(-50%, -50%)";
          modal.style.backgroundColor = "white";
          modal.style.padding = "20px";
          modal.style.border = "1px solid #ccc";
          modal.style.borderRadius = "8px";
          modal.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
          modal.style.zIndex = "1000";
          modal.style.display = "none";
          modal.style.width = "90%";
          modal.style.maxWidth = "900px";
          modal.style.maxHeight = "90%";
          modal.style.overflowY = "auto";

          // Info fields container
          const infoContainer = document.createElement("div");
          infoContainer.id = "modalInfoContainer";
          infoContainer.style.marginBottom = "15px";
          modal.appendChild(infoContainer);

          // Proces-verbaal textarea
          const textarea = document.createElement("textarea");
          textarea.id = "editorTextarea";
          textarea.style.width = "100%";
          textarea.style.height = "300px";
          modal.appendChild(textarea);

          // Button container
          const buttonContainer = document.createElement("div");
          buttonContainer.style.marginTop = "15px";
          buttonContainer.style.display = "flex";
          buttonContainer.style.justifyContent = "space-between";
          buttonContainer.style.flexWrap = "wrap";
          modal.appendChild(buttonContainer);

          // Save button (blue)
          const saveBtn = document.createElement("button");
          saveBtn.textContent = "Save";
          saveBtn.className = "btn btn-primary mb-2";
          saveBtn.style.marginRight = "10px";
          saveBtn.addEventListener("click", () => {
            currentData = {
              ID: document.getElementById("inputID").value,
              datum: document.getElementById("inputDatum").value,
              tijd: document.getElementById("inputTijd").value,
              verdachte: document.getElementById("inputVerdachte").value,
              geboortedag: document.getElementById("inputGeboortedag").value,
              geboortestad: document.getElementById("inputGeboortestad").value,
              woonadres: document.getElementById("inputWoonadres").value,
              woonstad: document.getElementById("inputWoonstad").value,
              locatie: document.getElementById("inputLocatie").value,
              verbalisanten:
                document.getElementById("inputVerbalisanten").value,
              proces_verbaal: document.getElementById("editorTextarea").value,
            };
            console.log("Saved data:", currentData); // replace this with logic to persist the changes
            ws.send(
              JSON.stringify({ action: "update-pv-information", currentData })
            );

            // Create and show temporary "Saved" popup
            const popup = document.createElement("div");
            popup.textContent = "✔️ Opgeslagen";
            popup.style.position = "fixed";
            popup.style.bottom = "20px";
            popup.style.right = "20px";
            popup.style.backgroundColor = "#28a745";
            popup.style.color = "white";
            popup.style.padding = "10px 16px";
            popup.style.borderRadius = "5px";
            popup.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
            popup.style.fontSize = "16px";
            popup.style.zIndex = "2000";
            popup.style.opacity = "1";
            popup.style.transition = "opacity 1s ease";

            document.body.appendChild(popup);

            // Fade out and remove after 2 seconds
            setTimeout(() => {
              popup.style.opacity = "0";
              setTimeout(() => {
                popup.remove();
              }, 1000);
            }, 1500);
          });
          buttonContainer.appendChild(saveBtn);

          // Generate Report button (orange)
          const generateBtn = document.createElement("button");
          generateBtn.textContent = "Generate Report";
          generateBtn.className = "btn mb-2";
          generateBtn.style.backgroundColor = "orange";
          generateBtn.style.color = "white";
          generateBtn.addEventListener("click", () => {
            currentData = {
              ID: document.getElementById("inputID").value,
              datum: document.getElementById("inputDatum").value,
              tijd: document.getElementById("inputTijd").value,
              verdachte: document.getElementById("inputVerdachte").value,
              geboortedag: document.getElementById("inputGeboortedag").value,
              geboortestad: document.getElementById("inputGeboortestad").value,
              woonadres: document.getElementById("inputWoonadres").value,
              woonstad: document.getElementById("inputWoonstad").value,
              locatie: document.getElementById("inputLocatie").value,
              verbalisanten: document.getElementById("inputVerbalisanten").value,
              proces_verbaal: document.getElementById("editorTextarea").value,
            };
          
            // Check for "niet gevonden" values
            const missingFields = [];
            for (const [key, value] of Object.entries(currentData)) {
              if (typeof value === "string" && value.trim().toLowerCase() === "niet gevonden") {
                missingFields.push(key);
              }
            }
          
            if (missingFields.length > 0) {
              console.log("Missing fields:", missingFields);
              const popup = document.createElement("div");
              popup.innerHTML = `<strong>Error!</strong><br>Geen resultaat gegeven voor: ${missingFields.join(", ")}`;
              popup.style.position = "fixed";
              popup.style.bottom = "20px";
              popup.style.right = "20px";
              popup.style.backgroundColor = "#dc3545"; // Bootstrap danger color
              popup.style.color = "white";
              popup.style.padding = "12px 18px";
              popup.style.borderRadius = "6px";
              popup.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
              popup.style.fontSize = "16px";
              popup.style.zIndex = "2000";
              popup.style.opacity = "1";
              popup.style.transition = "opacity 1s ease";
          
              document.body.appendChild(popup);
          
              setTimeout(() => {
                popup.style.opacity = "0";
                setTimeout(() => popup.remove(), 1000);
              }, 3000);
          
              return; // Stop further execution if error
            }
          
            // If everything is OK
            console.log("Saved data:", currentData);
            ws.send(
              JSON.stringify({ action: "update-pv-information", currentData })
            );
          
            setTimeout(function () {
              downloadPDF(
                "data/verwerkt/" + currentData.ID,
                currentData.ID + "pdf"
              );
            }, 2000);
          

            // Create and show temporary "Saved" popup
            const popup = document.createElement("div");
            popup.textContent = "!Generating!";
            popup.style.position = "fixed";
            popup.style.bottom = "20px";
            popup.style.right = "20px";
            popup.style.backgroundColor = "#24a745";
            popup.style.color = "white";
            popup.style.padding = "10px 16px";
            popup.style.borderRadius = "5px";
            popup.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
            popup.style.fontSize = "16px";
            popup.style.zIndex = "2000";
            popup.style.opacity = "1";
            popup.style.transition = "opacity 1s ease";

            document.body.appendChild(popup);

            // Fade out and remove after 2 seconds
            setTimeout(() => {
              popup.style.opacity = "0";
              setTimeout(() => {
                popup.remove();
              }, 1000);
            }, 1500);
          });
          buttonContainer.appendChild(generateBtn);

          // Close button
          const closeBtn = document.createElement("button");
          closeBtn.textContent = "Close";
          closeBtn.className = "btn btn-secondary mt-2";
          closeBtn.style.marginLeft = "auto";
          closeBtn.addEventListener("click", () => {
            modal.style.display = "none";
          });
          buttonContainer.appendChild(closeBtn);

          document.body.appendChild(modal);
        }

        // Show editor with item.text on click
        btn.addEventListener("click", () => {
          const infoContainer = document.getElementById("modalInfoContainer");
          infoContainer.innerHTML = `
            <label><strong>ID (filename):</strong> <textarea id="inputID" class="form-control mb-2" readonly>${
              item.filename || ""
            }</textarea>
            </label>
            <label><strong>Datum:</strong><textarea id="inputDatum" class="form-control mb-2">${
              item.datum || ""
            }</textarea></label>
            <label><strong>Tijd:</strong><textarea id="inputTijd" class="form-control mb-2">${
              item.tijd || ""
            }</textarea></label>
            <label><strong>Verdachte:</strong><textarea id="inputVerdachte" class="form-control mb-2">${
              item.verdachte || ""
            }</textarea></label>
            <label><strong>Geboortedatum:</strong><textarea id="inputGeboortedag" class="form-control mb-2">${
              item.geboortedag || ""
            }</textarea></label>
            <label><strong>Geboortestad:</strong><textarea id="inputGeboortestad" class="form-control mb-2">${
              item.geboortestad || ""
            }</textarea></label>
            <label><strong>Woonadres:</strong><textarea id="inputWoonadres" class="form-control mb-2">${
              item.woonadres || ""
            }</textarea></label>
            <label><strong>Woonstad:</strong><textarea id="inputWoonstad" class="form-control mb-2">${
              item.woonstad || ""
            }</textarea></label>
            <label><strong>Locatie verhoor:</strong><textarea id="inputLocatie" class="form-control mb-2">${
              item.locatie || ""
            }</textarea></label>
            <label><strong>Verbalisanten:</strong><textarea id="inputVerbalisanten" class="form-control mb-2">${
              item.verbalisanten || ""
            }</textarea></label>
          `;

          const textarea = document.getElementById("editorTextarea");
          textarea.value =
            item?.proces_verbaal || "Geen proces-verbaal beschikbaar.";

          modal.style.display = "block";
        });

        // Create the Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-danger mb-3 ms-2"; // red button with left spacing
        deleteBtn.textContent = "Delete";

        // Delete button logic
        deleteBtn.addEventListener("click", () => {
          // Immediately show spinner in the row
          tdAction.innerHTML = `
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Deleting...</span>
    </div>
    <span class="ms-2">verwijderen...</span>
  `;

          // Send WebSocket message
          ws.send(
            JSON.stringify({
              action: "delete-pv",
              filename: item.filename,
            })
          );
          setTimeout(function () {
            ws.send(
              JSON.stringify({
                action: "pv-update",
              })
            );
          }, 2000);
        });

        tdAction.appendChild(btn);
        tdAction.appendChild(deleteBtn);
        break;

      case "working":
        // Spinner
        const spinner = document.createElement("div");
        spinner.className = "spinner-border spinner-border-sm";
        spinner.role = "status";
        spinner.innerHTML = `<span class="visually-hidden">Loading...</span>`;

        // Status text
        const statusText = document.createElement("span");
        statusText.className = "ms-2";
        statusText.textContent = item.status;

        // Cancel button
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-warning btn-sm ms-3";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
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
        });

        // Append all
        tdAction.appendChild(spinner);
        tdAction.appendChild(statusText);
        tdAction.appendChild(cancelBtn);
        break;

      case "error":
        tdDate.textContent = "Error";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "btn btn-danger mb-3";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => {
          retryFile(item.filename);
        });

        // Create the Delete button
        const deleteBtn2 = document.createElement("button");
        deleteBtn2.type = "button";
        deleteBtn2.className = "btn btn-danger mb-3 ms-2"; // red button with left spacing
        deleteBtn2.textContent = "Delete";

        // Delete button logic
        deleteBtn2.addEventListener("click", () => {
          // Immediately show spinner in the row
          tdAction.innerHTML = `
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Deleting...</span>
    </div>
    <span class="ms-2">verwijderen...</span>
  `;

          // Send WebSocket message
          ws.send(
            JSON.stringify({
              action: "delete-unfinished-pv",
              filename: item.filename,
            })
          );
        });
        tdAction.appendChild(deleteBtn2);
        tdAction.appendChild(retryBtn);
        break;

      default:
        // If status is unknown, just show the status without any special action
        tdAction.innerHTML = `<span class="ms-2">${item.status}</span>`;
    }

    tr.append(tdFilename, tdDate, tdModel, tdAction);
    tbody.appendChild(tr);
  });
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
      ws.send(JSON.stringify({ action: "pv-update" }));
      break;

    case "pv-update":
      // renderTable handles both “none” and actual arrays
      renderTable(data.data);
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
    ws.send(JSON.stringify({ action: "pv-update" }));
  } else {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "pv-update" }));
    });
  }
});

// ===============
// UPLOAD FORM LOGIC
// ===============
function saveConfig(event) {
  event.preventDefault();

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
    <h5>Select Upload Options</h5>
    <div class="mb-3">
      <label for="popup_file_input" class="form-label">File</label>
      <input type="file" id="popup_file_input" class="form-control">
    </div>
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
    const popupFileInput = popup.querySelector("#popup_file_input");
    const file =
      popupFileInput.files[0] || document.getElementById("input_file").files[0];
    if (!file) {
      alert("Please select a file.");
      return;
    }

    const UUID = crypto.randomUUID();
    const config = {
      UUID,
      advanced: boolCheck.checked,
      model: modelSelect.value,
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("config", JSON.stringify(config));

    fetch(`/upload/${UUID}`, {
      method: "POST",
      body: formData,
    })
      .then(() => {
        sessionStorage.setItem("uuid", UUID);
        ws.send(JSON.stringify({ action: "pv-update" }));
        popup.remove();
      })
      .catch((err) => {
        console.error("Upload failed", err);
        alert("Upload failed. See console.");
      });
  });

  // Cancel button
  popup.querySelector("#popupCancelBtn").addEventListener("click", () => {
    popup.remove();
  });
}
