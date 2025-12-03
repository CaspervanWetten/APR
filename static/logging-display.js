function showTLogsModal(item, buttons) {
  ensureModalExists();

  const modal = document.getElementById("textEditorModal");
  const infoContainer = document.getElementById("modalInfoContainer");
  const buttonContainer = document.getElementById("modalButtonContainer");

  // Open modal
  modal.style.display = "block";

  // Reset containers
  infoContainer.innerHTML = "";
  buttonContainer.innerHTML = "";
  buttons?.forEach((btn) => buttonContainer.appendChild(btn));

  console.log(item.logs);
  // ---- Parse logs (strings OR objects) -----------------------------------------
  const raw = item?.logs ?? item?.text ?? item ?? [];

  const entries = [];
  const badLines = [];

  if (Array.isArray(raw)) {
    for (const el of raw) {
      if (el == null) continue;

      if (typeof el === "object") {
        // already a parsed log object
        entries.push(el);
        continue;
      }

      if (typeof el === "string") {
        const s = el.trim();
        if (!s) continue;
        try {
          entries.push(JSON.parse(s)); // array of JSON strings
        } catch {
          badLines.push(s); // not JSON → record as bad
        }
        continue;
      }

      // anything else (numbers, booleans, etc.)
      badLines.push(String(el));
    }
  } else if (typeof raw === "string") {
    // JSONL blob
    const lines = raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        badLines.push(line);
      }
    }
  } else if (typeof raw === "object" && raw) {
    // single log object
    entries.push(raw);
  }

  // ---- Build quick summary -----------------------------------------------------
  if (!entries.length) {
    infoContainer.innerHTML = `
      <div class="p-2">
        <strong>No logs to display.</strong>
        ${
          badLines.length
            ? `<div>${badLines.length} line(s) could not be parsed.</div>`
            : ""
        }
      </div>`;
    return;
  }

  // Helpers
  const escapeHTML = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const toLocal = (utc) => {
    try {
      const d = new Date(utc);
      if (isNaN(d)) return utc;
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return utc;
    }
  };

  const get = (o, k, fallback = "") => (o && o[k] != null ? o[k] : fallback);

  const by = (arr, key) => {
    const m = new Map();
    for (const a of arr) {
      const v = get(a, key, "—");
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const times = entries
    .map((e) => new Date(get(e, "datetime_utc")))
    .filter((d) => !isNaN(d));

  const minT = times.length ? new Date(Math.min(...times)) : null;
  const maxT = times.length ? new Date(Math.max(...times)) : null;

  const levels = [...new Set(entries.map((e) => get(e, "level", "—")))];
  const sources = [...new Set(entries.map((e) => get(e, "event_source", "—")))];
  const sessions = [...new Set(entries.map((e) => get(e, "sessieID", "—")))];

  // ---- Controls (search + filters) -------------------------------------------
  const controls = document.createElement("div");
  controls.className = "logs-controls";
  controls.innerHTML = `
    <div style="display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.5rem;">
      <input id="logsSearch" type="search" placeholder="Search input/results, IDs…" style="flex:1; min-width:220px; padding:.4rem;">
      <select id="levelFilter" style="padding:.4rem;">
        <option value="">All levels</option>
        ${levels.map((l) => `<option>${escapeHTML(l)}</option>`).join("")}
      </select>
      <select id="sourceFilter" style="padding:.4rem;">
        <option value="">All sources</option>
        ${sources.map((s) => `<option>${escapeHTML(s)}</option>`).join("")}
      </select>
      <select id="sessionFilter" style="padding:.4rem;">
        <option value="">All sessions</option>
        ${sessions.map((s) => `<option>${escapeHTML(s)}</option>`).join("")}
      </select>
      <label style="display:flex; align-items:center; gap:.25rem;">
        <input id="rawToggle" type="checkbox"> Show raw JSON
      </label>
    </div>
  `;

  // ---- Summary header ---------------------------------------------------------
  const levelCounts = by(entries, "level")
    .map(
      ([k, v]) =>
        `<span class="badge" data-level="${escapeHTML(k)}">${escapeHTML(
          k
        )}: ${v}</span>`
    )
    .join(" ");

  const sourceCounts = by(entries, "event_source")
    .map(([k, v]) => `<span class="badge">${escapeHTML(k)}: ${v}</span>`)
    .join(" ");

  const summary = document.createElement("div");
  summary.className = "logs-summary";
  summary.innerHTML = `
    <div style="margin-bottom:.5rem;">
      <strong>Total:</strong> ${entries.length}
      ${
        badLines.length
          ? ` • <strong>Unparsed:</strong> ${badLines.length}`
          : ""
      }
      ${minT ? ` • <strong>From:</strong> ${toLocal(minT.toISOString())}` : ""}
      ${maxT ? ` • <strong>To:</strong> ${toLocal(maxT.toISOString())}` : ""}
    </div>
    <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:.5rem;">
      <div><strong>Levels</strong> ${levelCounts}</div>
      <div><strong>Sources</strong> ${sourceCounts}</div>
    </div>
    <hr style="margin:.5rem 0;">
  `;

  // ---- Table -----------------------------------------------------------------
  const table = document.createElement("table");
  table.className = "logs-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Time (local)</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Level</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Source</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Event</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Session</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Activity</th>
        <th style="text-align:left; padding:.4rem; border-bottom:1px solid #ddd;">Input → Result</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  const renderRow = (e) => {
    const tLocal = toLocal(get(e, "datetime_utc", ""));
    const level = get(e, "level", "—");
    const source = get(e, "event_source", "—");
    const eventType = get(e, "event_type", "—");
    const sessieID = get(e, "sessieID", get(e, "gebruikersID", "—"));
    const activiteitID = get(e, "activiteitID", "—");
    const input = get(e, "input", get(e, "fileId", ""));
    const results = get(e, "results", "");

    const short = (s, n = 140) => {
      const str = String(s ?? "");
      return str.length > n ? str.slice(0, n - 1) + "…" : str;
    };

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f0f0f0";
    tr.innerHTML = `
      <td style="vertical-align:top; padding:.4rem; white-space:nowrap;">${escapeHTML(
        tLocal
      )}</td>
      <td style="vertical-align:top; padding:.4rem;">
        <span class="badge" data-level="${escapeHTML(level)}">${escapeHTML(
      level
    )}</span>
      </td>
      <td style="vertical-align:top; padding:.4rem;">${escapeHTML(source)}</td>
      <td style="vertical-align:top; padding:.4rem;">${escapeHTML(
        eventType
      )}</td>
      <td style="vertical-align:top; padding:.4rem; font-family:monospace;">${escapeHTML(
        sessieID
      )}</td>
      <td style="vertical-align:top; padding:.4rem; font-family:monospace;">${escapeHTML(
        activiteitID
      )}</td>
      <td style="vertical-align:top; padding:.4rem;">
        <div><strong>Input:</strong> ${escapeHTML(short(input))}</div>
        <div><strong>Result:</strong> ${escapeHTML(short(results))}</div>
        <details style="margin-top:.25rem;">
          <summary>Details</summary>
          <pre style="white-space:pre-wrap; margin: .25rem 0;">${escapeHTML(
            JSON.stringify(e, null, 2)
          )}</pre>
        </details>
      </td>
    `;
    return tr;
  };

  // initial render
  let filtered = entries.slice();
  const doRender = () => {
    tbody.innerHTML = "";
    for (const e of filtered) tbody.appendChild(renderRow(e));
  };

  // ---- Apply filters/search ---------------------------------------------------
  const searchEl = controls.querySelector("#logsSearch");
  const levelEl = controls.querySelector("#levelFilter");
  const sourceEl = controls.querySelector("#sourceFilter");
  const sessionEl = controls.querySelector("#sessionFilter");
  const rawToggle = controls.querySelector("#rawToggle");

  const apply = () => {
    const q = searchEl.value.trim().toLowerCase();
    const levelVal = levelEl.value;
    const sourceVal = sourceEl.value;
    const sessionVal = sessionEl.value;

    filtered = entries.filter((e) => {
      if (levelVal && get(e, "level", "") !== levelVal) return false;
      if (sourceVal && get(e, "event_source", "") !== sourceVal) return false;
      if (sessionVal && get(e, "sessieID", "") !== sessionVal) return false;

      if (!q) return true;

      const hay = [
        get(e, "input", ""),
        get(e, "results", ""),
        get(e, "event_type", ""),
        get(e, "event_source", ""),
        get(e, "level", ""),
        get(e, "sessieID", ""),
        get(e, "activiteitID", ""),
        get(e, "fileId", ""),
        get(e, "logger", ""),
        get(e, "model", ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    doRender();
  };

  ["input", "change"].forEach((ev) => {
    searchEl.addEventListener(ev, apply);
    levelEl.addEventListener(ev, apply);
    sourceEl.addEventListener(ev, apply);
    sessionEl.addEventListener(ev, apply);
  });

  rawToggle.addEventListener("change", () => {
    const detailsEls = tbody.querySelectorAll("details");
    detailsEls.forEach((d) => (d.open = rawToggle.checked));
  });

  // ---- Compose modal content --------------------------------------------------
  infoContainer.appendChild(summary);
  infoContainer.appendChild(controls);
  infoContainer.appendChild(table);

  // First paint
  apply();
}

function showALogsModal(item, buttons, opts = {}) {
  const {
    rollingWindow = 5,
    promptCharLimit = 120,
    maxPromptRows = 50,
    maxModalBodyVh = 70, // new: cap modal body height
  } = opts;

  ensureModalExists?.();

  // ---- Styles (once) ----
  (function ensureStyles() {
    if (document.getElementById("aLogsModalStyles")) return;
    const css = `
      .a-grid { display: grid; gap: 12px; grid-template-columns: 1fr; min-height:0; }
      @media (min-width: 900px) { .a-grid { grid-template-columns: 1.2fr 1fr; } }
      .a-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; box-shadow:0 1px 2px rgba(0,0,0,0.04); min-height:0; }
      .a-title { font-size:14px; font-weight:600; color:#111827; display:flex; align-items:center; gap:8px; }
      .a-subtle { color:#6b7280; font-size:12px; }
      .a-mono { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
      .a-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px dashed #f0f0f0; }
      .a-row:last-child { border-bottom:none; }
      .a-badge { background:#f3f4f6; color:#374151; font-size:11px; padding:2px 6px; border-radius:999px; }
      .a-scroll { max-height:300px; overflow:auto; scrollbar-width:thin; }
      .a-ellipsis { overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
      .a-muted { color:#9ca3af; }
      .a-placeholder { border:2px dashed #e5e7eb; border-radius:12px; height:260px; display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:13px; }
      .a-kpi { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:8px; }
      .a-kpi div { background:#f9fafb; border:1px solid #eef0f2; border-radius:10px; padding:8px 10px; font-size:12px; }
      /* new: scrolling wrapper to stop infinite growth */
      .a-modal-scroll { overflow:auto; scrollbar-width:thin; }
      /* Fix: Add explicit height constraints for chart containers */
      .a-chart-container { height: 200px; position: relative; }
      .a-chart-container canvas { max-height: 100% !important; }
    `;
    const style = document.createElement("style");
    style.id = "aLogsModalStyles";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ---- Ensure Chart.js ----
  function ensureChartJS() {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  const modal = document.getElementById("textEditorModal");
  const infoContainer = document.getElementById("modalInfoContainer");
  const buttonContainer = document.getElementById("modalButtonContainer");

  // Open modal
  modal.style.display = "block";
  // Safety: prevent outer modal from growing if it doesn't already constrain
  modal.style.maxHeight = "90vh";
  modal.style.overflow = "hidden";

  // Reset containers
  infoContainer.innerHTML = "";
  buttonContainer.innerHTML = "";
  buttons?.forEach((btn) => buttonContainer.appendChild(btn));

  // ---- Parse logs ----
  const raw = item?.logs ?? item?.text ?? item ?? [];
  const entries = [];
  const badLines = [];
  const pushParsed = (o) => { if (o && typeof o === "object") entries.push(o); };

  if (Array.isArray(raw)) {
    for (const el of raw) {
      if (el == null) continue;
      if (typeof el === "object") { entries.push(el); continue; }
      if (typeof el === "string") {
        const s = el.trim(); if (!s) continue;
        try { pushParsed(JSON.parse(s)); } catch { badLines.push(s); }
        continue;
      }
      badLines.push(String(el));
    }
  } else if (typeof raw === "string") {
    for (const line of raw.split(/\n+/).map(s=>s.trim()).filter(Boolean)) {
      try { pushParsed(JSON.parse(line)); } catch { badLines.push(line); }
    }
  } else if (typeof raw === "object" && raw) {
    entries.push(raw);
  }

  if (!entries.length) {
    infoContainer.innerHTML = `
      <div class="p-2">
        <strong>No logs to display.</strong>
        ${badLines.length ? `<div>${badLines.length} line(s) could not be parsed.</div>` : ""}
      </div>`;
    return;
  }

  // ---- Normalize ----
  const toDate = (d) => { try { return d ? new Date(d) : null; } catch { return null; } };
  const normalized = entries
    .map(e => ({
      dt: toDate(e.datetime_utc || e.datetime || e.timestamp),
      time_to_complete: typeof e.time_to_complete === "number" ? e.time_to_complete : null,
      model: e.model || e.engine_name || e.providerModel || "unknown",
      input: e.input ?? e.prompt ?? "",
      output: e.output ?? e.response ?? e.reply ?? e.completion ?? e.results ?? "",
      session: e.sessieID || e.sessionID || e.sessionId || e.sessieId || e.sid || null,
      event_type: e.event_type || null,
      event_source: e.event_source || null,
      fileId: e.fileId || (e.updated_data && e.updated_data.ID) || null
    }))
    .filter(e => e.dt instanceof Date && !isNaN(+e.dt));

  normalized.sort((a,b)=>+a.dt - +b.dt);

  // ---- Rolling avg ----
  const times = normalized.map(e=>e.time_to_complete).filter(v=>typeof v === "number");
  const rolling = [];
  for (let i=0;i<times.length;i++){
    const start = Math.max(0, i - (rollingWindow - 1));
    let sum=0, count=0;
    for (let j=start;j<=i;j++){ const t=times[j]; if (typeof t === "number"){ sum+=t; count++; } }
    rolling.push(count ? +(sum/count).toFixed(3) : null);
  }
  const timeEntries = normalized.filter(e=>typeof e.time_to_complete === "number");
  const rLabels = timeEntries.map(e=>e.dt.toISOString().substring(11,19));

  // ---- Model frequencies (filter out unknown/blank) ----
  const modelCounts = new Map();
  for (const e of normalized) {
    const rawModel = (e.model ?? "").toString().trim();
    const key = rawModel || "unknown";
    if (key.toLowerCase() === "unknown" || key === "") continue; // skip unknowns
    modelCounts.set(key, (modelCounts.get(key) || 0) + 1);
  }
  const modelLabels = Array.from(modelCounts.keys());
  const modelData = Array.from(modelCounts.values());

  // ---- Prompts list ----
  const seen = new Set();
  const promptRows = [];
  for (let i=normalized.length-1; i>=0; i--){
    const p = (normalized[i].input ?? "").trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    promptRows.push({ 
      prompt: p, 
      reply: (normalized[i].output ?? "").trim(),
      session: normalized[i].session, 
      dt: normalized[i].dt 
    });
    if (promptRows.length >= maxPromptRows) break;
  }
  const truncate = (s,n)=>!s?"":(s.length<=n?s:(s.slice(0,n-1)+"…"));

  // ---- Edits per Report Calculation ----
  const reportGenerated = normalized.filter(e => 
    e.event_type === "administrative" && 
    e.event_source === "generateReport" && 
    e.fileId
  );
  
  const reportUpdates = normalized.filter(e => 
    e.event_type === "administrative" && 
    e.event_source === "update-pv-information" && 
    e.fileId
  );

  // Group updates by fileId
  const updatesByFileId = new Map();
  for (const update of reportUpdates) {
    const fileId = update.fileId;
    if (!updatesByFileId.has(fileId)) {
      updatesByFileId.set(fileId, 0);
    }
    updatesByFileId.set(fileId, updatesByFileId.get(fileId) + 1);
  }

  // Calculate average edits per generated report
  let avgEditsPerReport = 0;
  if (reportGenerated.length > 0) {
    const totalEdits = reportGenerated.reduce((sum, report) => {
      const edits = updatesByFileId.get(report.fileId) || 0;
      return sum + edits;
    }, 0);
    avgEditsPerReport = totalEdits / reportGenerated.length;
  }

  // KPIs (use filtered modelLabels length)
  const kpi = {
    count: normalized.length,
    uniqueModels: modelLabels.length,
    avgTTC: times.length ? (times.reduce((a,b)=>a+b,0)/times.length) : null,
    lastAt: normalized[normalized.length-1]?.dt,
    reportsGenerated: reportGenerated.length,
    avgEditsPerReport: avgEditsPerReport
  };

  // ---- Layout (wrap content in a fixed-height scroll container) ----
  const wrapper = document.createElement("div");
  wrapper.className = "a-modal-scroll";
  wrapper.style.maxHeight = `${maxModalBodyVh}vh`; // key line preventing infinite growth
  wrapper.innerHTML = `
    <div class="a-grid">
      <section class="a-card">
        <div class="a-title">⏱️ Rolling Avg: time_to_complete <span class="a-badge">window=${rollingWindow}</span></div>
        <div class="a-kpi">
          <div><strong>${kpi.count}</strong> events</div>
          <div><strong>${kpi.uniqueModels}</strong> models</div>
          <div>avg ttc: <strong>${kpi.avgTTC != null ? kpi.avgTTC.toFixed(3) : "—"}</strong> s</div>
          <div><strong>${kpi.reportsGenerated}</strong> reports</div>
          <div>avg edits/report: <strong>${kpi.avgEditsPerReport > 0 ? kpi.avgEditsPerReport.toFixed(1) : "—"}</strong></div>
          <div class="a-muted">last: ${kpi.lastAt ? kpi.lastAt.toISOString() : "—"}</div>
        </div>
        <div class="a-chart-container">
          <canvas id="chartRollingTTC"></canvas>
        </div>
      </section>

      <section class="a-card">
        <div class="a-title">🤖 Model usage (frequency)</div>
        ${modelLabels.length ? `<div class="a-chart-container"><canvas id="chartModelFreq"></canvas></div>` :
          `<div class="a-subtle">No known models to display.</div>`}
      </section>

      <section class="a-card" style="grid-column:1 / -1;">
        <div class="a-title">📝 Recent unique prompts <span class="a-badge">${promptRows.length}</span></div>
        <div class="a-subtle" style="margin-bottom:6px;">Truncated to ${promptCharLimit} chars. Newest first.</div>
        <div class="a-scroll">
          ${promptRows.map(row=>`
            <div class="a-row">
              <div style="min-width:0; flex:1;">
                <div class="a-ellipsis">${escapeHTML(truncate(row.prompt, promptCharLimit))}</div>
                ${row.reply ? `<small class="a-subtle a-ellipsis" style="display:block; margin-top:4px;">${escapeHTML(truncate(row.reply, promptCharLimit))}</small>` : ""}
                <div class="a-subtle a-mono">${row.session ? escapeHTML(row.session) : "no-session"} • ${row.dt.toISOString()}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="a-card" style="grid-column:1 / -1;">
        <div class="a-title">📈 Long-term tracking (placeholder)</div>
        <div class="a-placeholder">
          <div>
            <div style="text-align:center;margin-bottom:8px;">Graph placeholder</div>
            <canvas id="chartLongTerm" width="600" height="220" style="opacity:0.3; pointer-events:none;"></canvas>
            <div class="a-subtle" style="text-align:center;margin-top:6px;">Hook up your timeseries here (e.g., daily aggregates)</div>
          </div>
        </div>
      </section>
    </div>
    ${badLines.length ? `<div class="a-subtle" style="margin-top:8px;">${badLines.length} line(s) could not be parsed.</div>` : ""}
  `;
  infoContainer.innerHTML = "";      // clear
  infoContainer.appendChild(wrapper); // mount scroll wrapper

  // ---- Charts ----
  ensureChartJS().then(() => {
    const ctx1 = document.getElementById("chartRollingTTC");
    if (ctx1 && rLabels.length && rolling.length) {
      destroyIfExists(ctx1);
      new Chart(ctx1, {
        type: "line",
        data: { labels: rLabels, datasets: [{ label: `Rolling avg (${rollingWindow})`, data: rolling, tension: 0.25, borderWidth: 2, pointRadius: 0, fill: false }] },
        options: {
          responsive: true, 
          maintainAspectRatio: false,
          scales: { x: { ticks: { maxRotation: 0, autoSkip: true } }, y: { title: { display: true, text: "seconds" }, beginAtZero: true } },
          plugins: { legend: { display: true }, tooltip: { mode: "index", intersect: false } }
        }
      });
    }

    const ctx2 = document.getElementById("chartModelFreq");
    if (ctx2 && modelLabels.length) {
      destroyIfExists(ctx2);
      new Chart(ctx2, {
        type: "bar",
        data: { labels: modelLabels, datasets: [{ label: "Count", data: modelData, borderWidth: 1 }] },
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          scales: { y: { beginAtZero: true } }, 
          plugins: { legend: { display: false } } 
        }
      });
    }

    const ctx3 = document.getElementById("chartLongTerm");
    if (ctx3) {
      destroyIfExists(ctx3);
      new Chart(ctx3, { type: "line", data: { labels: [], datasets: [{ label: "Long-term series", data: [] }] }, options: { plugins: { legend: { display: false } } } });
    }
  }).catch(()=>{ /* ignore */ });

  // ---- Helpers ----
  function destroyIfExists(canvasEl) {
    const id = canvasEl.getAttribute("id");
    if (!id || !window.Chart) return;
    Chart.getChart(id)?.destroy();
  }
  function escapeHTML(s) {
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
}