const ws = new WebSocket("ws://localhost:8080/ws/APR");
const tbody = document.getElementById("pv-table-body");
const retryInFlight = new Set();
let noneSeen = false;

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
    const tdAction = document.createElement("td");

    tr.dataset.filename = item.filename;
    tdFilename.textContent = item.filename;

    // Match on status values
    switch (item.status) {
      case "done":
        tdDate.textContent = "Done";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary mb-3";
        btn.textContent = "Download";
        btn.addEventListener("click", () => {
          const url = `${window.location.origin}/download/${encodeURIComponent(
            item.filename
          )}`;
          window.open(url, "_blank");
        });
        tdAction.appendChild(btn);
        break;

      case "working":
        tdAction.innerHTML = `
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span class="ms-2">${item.status}</span>
        `;
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
        tdAction.appendChild(retryBtn);
        break;

      default:
        // If status is unknown, just show the status without any special action
        tdAction.innerHTML = `<span class="ms-2">${item.status}</span>`;
    }

    tr.append(tdFilename, tdDate, tdAction);
    tbody.appendChild(tr);
  });
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

  const UUID = crypto.randomUUID();
  const fileInput = document.getElementById("input_file");
  const file = fileInput.files[0];

  const config = { UUID };
  const formData = new FormData();
  formData.append("file", file);
  formData.append("config", JSON.stringify(config));

  fetch(`/upload/${UUID}`, {
    method: "POST",
    body: formData,
  })
    .then(() => {
      sessionStorage.setItem("uuid", UUID);
      // immediately refresh table
      ws.send(JSON.stringify({ action: "pv-update" }));
    })
    .catch((err) => {
      console.error("Upload failed", err);
    });
}
