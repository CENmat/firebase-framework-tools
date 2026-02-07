/**
 * FeedstockMatch — Frontend Application
 *
 * Vanilla JS + Leaflet.js + Chart.js
 * Handles: navigation, map, heatmap, charts, match explorer, scenario sliders,
 *          listings, audit trail, and LCA methodology transparency.
 */

const API = "/api";

// ── State ─────────────────────────────────────────────────────────────

let feedstocks = [];
let processors = [];
let matchResults = [];
let map = null;
let heatmapLayer = null;
let feedstockMarkers = null;
let processorMarkers = null;

// ── Navigation ────────────────────────────────────────────────────────

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    const viewId = "view-" + btn.dataset.view;
    document.getElementById(viewId).classList.add("active");

    if (btn.dataset.view === "map") initMap();
    if (btn.dataset.view === "dashboard") loadDashboard();
    if (btn.dataset.view === "listings") loadListings();
    if (btn.dataset.view === "audit") loadAudit();
    if (btn.dataset.view === "methodology") loadMethodology();
    if (btn.dataset.view === "matches") loadMatchView();
  });
});

// Tab switching for listings
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── API helpers ───────────────────────────────────────────────────────

async function fetchJSON(path) {
  const res = await fetch(API + path);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Dashboard ─────────────────────────────────────────────────────────

async function loadDashboard() {
  feedstocks = await fetchJSON("/feedstocks");
  processors = await fetchJSON("/processors");
  const matches = await fetchJSON("/matches");
  const heatmap = await fetchJSON("/data/heatmap");
  const faoData = await fetchJSON("/data/faostat/residues");

  // Stats
  document.getElementById("stat-feedstocks").textContent = feedstocks.length;
  document.getElementById("stat-processors").textContent = processors.length;
  document.getElementById("stat-matches").textContent = matches.length;

  const totalGHG = matches.reduce((sum, m) => sum + (m.lca?.netImpactKg || 0), 0);
  document.getElementById("stat-ghg").textContent = formatNumber(totalGHG / 1000);

  // Charts
  renderSupplyChart(feedstocks);
  renderProcessorChart(processors);
  renderRegionalChart(feedstocks, processors);
  renderFAOTable(faoData.estimates);
}

function renderSupplyChart(data) {
  const categories = {};
  data.forEach((f) => {
    categories[f.category] = (categories[f.category] || 0) + f.volumeTonnesPerMonth;
  });

  const ctx = document.getElementById("chart-supply-category");
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(categories).map(formatCategory),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6"],
        borderWidth: 0,
      }],
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { color: "#9ba3b5", font: { size: 11 } } },
      },
      responsive: true,
      maintainAspectRatio: true,
    },
  });
}

function renderProcessorChart(data) {
  const techs = {};
  data.forEach((p) => {
    const label = formatTechnology(p.technology);
    techs[label] = (techs[label] || 0) + 1;
  });

  const ctx = document.getElementById("chart-processor-tech");
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(techs),
      datasets: [{
        label: "Facilities",
        data: Object.values(techs),
        backgroundColor: "#3b82f6",
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#2e3340" }, ticks: { color: "#9ba3b5" } },
        y: { grid: { display: false }, ticks: { color: "#9ba3b5", font: { size: 11 } } },
      },
      responsive: true,
      maintainAspectRatio: true,
    },
  });
}

function renderRegionalChart(feedstockData, processorData) {
  const regions = {};
  feedstockData.forEach((f) => {
    if (!regions[f.region]) regions[f.region] = { supply: 0, demand: 0 };
    regions[f.region].supply += f.volumeTonnesPerMonth;
  });
  processorData.forEach((p) => {
    if (!regions[p.region]) regions[p.region] = { supply: 0, demand: 0 };
    const available = p.intakeCapacityTonnesPerMonth * (1 - p.currentUtilizationPct / 100);
    regions[p.region].demand += available;
  });

  const labels = Object.keys(regions);
  const ctx = document.getElementById("chart-regional");
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Supply (t/mo)", data: labels.map((r) => regions[r].supply), backgroundColor: "#22c55e", borderRadius: 4 },
        { label: "Demand (t/mo)", data: labels.map((r) => regions[r].demand), backgroundColor: "#f59e0b", borderRadius: 4 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#9ba3b5" } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#9ba3b5" } },
        y: { grid: { color: "#2e3340" }, ticks: { color: "#9ba3b5" } },
      },
      responsive: true,
      maintainAspectRatio: true,
    },
  });
}

function renderFAOTable(estimates) {
  const container = document.getElementById("faostat-table-container");
  const rows = estimates.slice(0, 12).map((e) => `
    <tr>
      <td>${e.countryName}</td>
      <td>${e.crop}</td>
      <td>${formatNumber(e.productionTonnes / 1e6)}</td>
      <td>${e.residueToProductRatio}</td>
      <td>${formatNumber(e.availableResidueTonnes / 1e6)}</td>
      <td class="factor-source">${e.source.substring(0, 40)}...</td>
    </tr>
  `).join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Country</th>
          <th>Crop</th>
          <th>Production (Mt)</th>
          <th>RPR</th>
          <th>Available Residue (Mt)</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Map ───────────────────────────────────────────────────────────────

async function initMap() {
  if (map) return; // already initialized

  feedstocks = await fetchJSON("/feedstocks");
  processors = await fetchJSON("/processors");
  const heatmapData = await fetchJSON("/data/heatmap");

  map = L.map("map-container").setView([39.5, -98.35], 4);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  // Heatmap layer
  const heatPoints = heatmapData.cells.map((c) => {
    const intensity = Math.abs(c.surplus) / Math.max(1, Math.max(...heatmapData.cells.map((x) => Math.abs(x.surplus))));
    return [c.lat, c.lng, intensity];
  });

  heatmapLayer = L.heatLayer(heatPoints, {
    radius: 35,
    blur: 25,
    maxZoom: 10,
    gradient: { 0.2: "#22c55e", 0.5: "#f59e0b", 0.8: "#ef4444" },
  }).addTo(map);

  // Feedstock markers
  feedstockMarkers = L.layerGroup();
  feedstocks.forEach((f) => {
    const marker = L.circleMarker([f.location.lat, f.location.lng], {
      radius: Math.min(12, 4 + f.volumeTonnesPerMonth / 100),
      fillColor: "#22c55e",
      color: "#16a34a",
      weight: 2,
      fillOpacity: 0.8,
    });
    marker.bindPopup(`
      <div style="font-size:13px;min-width:200px;">
        <strong>${f.name}</strong><br>
        <span style="color:#888;">${formatCategory(f.category)} / ${f.subtype}</span><br>
        <strong>${f.volumeTonnesPerMonth}</strong> t/month<br>
        ${f.address}<br>
        <span style="color:#888;">Baseline: ${f.baselineScenario.replace(/_/g, " ")}</span>
      </div>
    `);
    feedstockMarkers.addLayer(marker);
  });
  feedstockMarkers.addTo(map);

  // Processor markers
  processorMarkers = L.layerGroup();
  processors.forEach((p) => {
    const available = p.intakeCapacityTonnesPerMonth * (1 - p.currentUtilizationPct / 100);
    const marker = L.circleMarker([p.location.lat, p.location.lng], {
      radius: Math.min(14, 5 + available / 100),
      fillColor: "#f59e0b",
      color: "#d97706",
      weight: 2,
      fillOpacity: 0.8,
    });
    marker.bindPopup(`
      <div style="font-size:13px;min-width:200px;">
        <strong>${p.name}</strong><br>
        <span style="color:#888;">${formatTechnology(p.technology)}</span><br>
        Capacity: <strong>${p.intakeCapacityTonnesPerMonth}</strong> t/month
        (${p.currentUtilizationPct}% utilized)<br>
        Available: <strong>${Math.round(available)}</strong> t/month<br>
        ${p.address}<br>
        Radius: ${p.serviceRadiusKm} km
      </div>
    `);
    processorMarkers.addLayer(marker);
  });
  processorMarkers.addTo(map);

  // Toggle controls
  document.getElementById("toggle-heatmap").addEventListener("change", (e) => {
    e.target.checked ? map.addLayer(heatmapLayer) : map.removeLayer(heatmapLayer);
  });
  document.getElementById("toggle-feedstocks").addEventListener("change", (e) => {
    e.target.checked ? map.addLayer(feedstockMarkers) : map.removeLayer(feedstockMarkers);
  });
  document.getElementById("toggle-processors").addEventListener("change", (e) => {
    e.target.checked ? map.addLayer(processorMarkers) : map.removeLayer(processorMarkers);
  });
}

// ── Matches View ──────────────────────────────────────────────────────

async function loadMatchView() {
  feedstocks = await fetchJSON("/feedstocks");
  const select = document.getElementById("match-feedstock-select");
  select.innerHTML = '<option value="">Select a feedstock...</option>';
  feedstocks.forEach((f) => {
    select.innerHTML += `<option value="${f.id}">${f.name} (${f.volumeTonnesPerMonth} t/mo)</option>`;
  });
}

document.getElementById("btn-find-matches").addEventListener("click", async () => {
  const feedstockId = document.getElementById("match-feedstock-select").value;
  if (!feedstockId) return;

  document.getElementById("scenario-panel").style.display = "block";

  const scenario = getScenarioParams();
  matchResults = await postJSON("/matches/find", { feedstockId, scenario });
  renderMatchResults(matchResults);
});

// Slider live updates
["slider-distance", "slider-leak", "slider-grid"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    if (id === "slider-distance") document.getElementById("val-distance").textContent = el.value;
    if (id === "slider-leak") document.getElementById("val-leak").textContent = el.value;
    if (id === "slider-grid") document.getElementById("val-grid").textContent = parseFloat(el.value).toFixed(2);
  });
});

// Re-run scenario on slider change (debounced)
let scenarioTimeout = null;
document.getElementById("scenario-panel")?.addEventListener("input", () => {
  clearTimeout(scenarioTimeout);
  scenarioTimeout = setTimeout(async () => {
    const feedstockId = document.getElementById("match-feedstock-select").value;
    if (!feedstockId) return;
    const scenario = getScenarioParams();
    matchResults = await postJSON("/matches/find", { feedstockId, scenario });
    renderMatchResults(matchResults);
  }, 500);
});

function getScenarioParams() {
  return {
    maxDistanceKm: parseInt(document.getElementById("slider-distance").value),
    transportMode: document.getElementById("select-transport").value,
    baselineScenario: document.getElementById("select-baseline").value,
    fugitiveLeakRatePct: parseFloat(document.getElementById("slider-leak").value),
    gridEmissionFactor: parseFloat(document.getElementById("slider-grid").value),
    includeAvoidedEmissions: document.getElementById("check-avoided").checked,
  };
}

function renderMatchResults(matches) {
  const container = document.getElementById("match-results");
  if (matches.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--color-text-secondary);">No compatible matches found. Try adjusting the scenario parameters.</div>';
    return;
  }

  container.innerHTML = matches.map((m) => {
    const scoreClass = m.compatibilityScore >= 70 ? "score-high" : m.compatibilityScore >= 40 ? "score-medium" : "score-low";
    const netClass = m.lca.netImpactKg > 0 ? "positive" : "negative";
    const processorName = processors.find((p) => p.id === m.processorId)?.name || m.processorId;
    const tech = processors.find((p) => p.id === m.processorId)?.technology || "";

    return `
      <div class="match-card" data-match-id="${m.id}" onclick="showMatchDetail('${m.id}')">
        <div class="match-card-header">
          <div>
            <div class="match-card-title">${processorName}</div>
            <div class="match-card-subtitle">${formatTechnology(tech)} &middot; ${m.transport.distanceKm} km away</div>
          </div>
          <span class="score-badge ${scoreClass}">${m.compatibilityScore}</span>
        </div>
        <div class="match-metrics">
          <div class="metric">
            <div class="metric-value ${netClass}">${formatNumber(m.lca.netImpactKg / 1000)}</div>
            <div class="metric-label">Net GHG (t CO2e)</div>
          </div>
          <div class="metric">
            <div class="metric-value">${m.transport.distanceKm}</div>
            <div class="metric-label">Distance (km)</div>
          </div>
          <div class="metric">
            <span class="risk-badge risk-${m.contaminationRisk}">${m.contaminationRisk}</span>
            <div class="metric-label">Contamination Risk</div>
          </div>
          <div class="metric">
            <div class="metric-value">${m.volumeTonnesProposed}</div>
            <div class="metric-label">Volume (t/mo)</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ── Match Detail Modal ────────────────────────────────────────────────

window.showMatchDetail = function (matchId) {
  const m = matchResults.find((x) => x.id === matchId);
  if (!m) return;

  const feedstock = feedstocks.find((f) => f.id === m.feedstockId);
  const processor = processors.find((p) => p.id === m.processorId);
  const modal = document.getElementById("match-modal");
  const body = document.getElementById("modal-body");

  const total = m.lca.baselineEmissionsKg + m.lca.transportEmissionsKg + m.lca.processingEmissionsKg + m.lca.avoidedEmissionsKg;
  const pctBaseline = Math.round((m.lca.baselineEmissionsKg / total) * 100);
  const pctTransport = Math.round((m.lca.transportEmissionsKg / total) * 100);
  const pctProcessing = Math.round((m.lca.processingEmissionsKg / total) * 100);
  const pctAvoided = Math.round((m.lca.avoidedEmissionsKg / total) * 100);

  body.innerHTML = `
    <h2 style="margin-bottom:4px;">${feedstock?.name || ""} &rarr; ${processor?.name || ""}</h2>
    <p style="color:var(--color-text-secondary);font-size:13px;margin-bottom:20px;">
      ${formatTechnology(processor?.technology || "")} &middot; ${m.transport.distanceKm} km &middot; ${m.transport.routeSource === "osrm" ? "OSRM routing" : "Haversine estimate"}
    </p>

    <h3 style="font-size:14px;color:var(--color-text-secondary);margin-bottom:8px;">LCA Breakdown</h3>
    <div class="lca-breakdown">
      <div class="lca-bar-container">
        <div class="lca-bar-segment" style="width:${pctBaseline}%;background:#22c55e;" title="Baseline avoided: ${formatNumber(m.lca.baselineEmissionsKg)} kg">${pctBaseline > 10 ? pctBaseline + "%" : ""}</div>
        <div class="lca-bar-segment" style="width:${pctTransport}%;background:#ef4444;" title="Transport: ${formatNumber(m.lca.transportEmissionsKg)} kg">${pctTransport > 10 ? pctTransport + "%" : ""}</div>
        <div class="lca-bar-segment" style="width:${pctProcessing}%;background:#f59e0b;" title="Processing: ${formatNumber(m.lca.processingEmissionsKg)} kg">${pctProcessing > 10 ? pctProcessing + "%" : ""}</div>
        <div class="lca-bar-segment" style="width:${pctAvoided}%;background:#3b82f6;" title="Avoided credits: ${formatNumber(m.lca.avoidedEmissionsKg)} kg">${pctAvoided > 10 ? pctAvoided + "%" : ""}</div>
      </div>
      <div class="lca-legend">
        <div class="lca-legend-item"><div class="lca-legend-dot" style="background:#22c55e;"></div> Baseline avoided: ${formatNumber(m.lca.baselineEmissionsKg)} kg CO2e</div>
        <div class="lca-legend-item"><div class="lca-legend-dot" style="background:#ef4444;"></div> Transport: ${formatNumber(m.lca.transportEmissionsKg)} kg CO2e</div>
        <div class="lca-legend-item"><div class="lca-legend-dot" style="background:#f59e0b;"></div> Processing: ${formatNumber(m.lca.processingEmissionsKg)} kg CO2e</div>
        <div class="lca-legend-item"><div class="lca-legend-dot" style="background:#3b82f6;"></div> Avoided credits: ${formatNumber(m.lca.avoidedEmissionsKg)} kg CO2e</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;">
      <div class="card">
        <h3>Net GHG Impact</h3>
        <div style="font-size:28px;font-weight:800;font-family:var(--font-mono);color:${m.lca.netImpactKg > 0 ? "var(--color-primary)" : "var(--color-danger)"};">
          ${m.lca.netImpactKg > 0 ? "+" : ""}${formatNumber(m.lca.netImpactKg / 1000)} t CO2e
        </div>
        <div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">
          ${m.lca.netImpactKg > 0 ? "Net climate benefit" : "Net climate cost"} &middot; &plusmn;${m.lca.uncertaintyRangePct}% uncertainty
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);margin-top:8px;">
          Data quality: ${m.lca.dataQualityScore}/5 &middot; Dominant param: ${m.lca.dominantParameter}
        </div>
      </div>
      <div class="card">
        <h3>Methodology Sources</h3>
        <div style="font-size:11px;line-height:1.7;">
          <div><strong>Baseline:</strong> <span class="factor-source">${m.lca.methodology.baselineSource}</span></div>
          <div><strong>Transport:</strong> <span class="factor-source">${m.lca.methodology.transportSource}</span></div>
          <div><strong>Processing:</strong> <span class="factor-source">${m.lca.methodology.processingSource}</span></div>
          <div><strong>Avoided:</strong> <span class="factor-source">${m.lca.methodology.avoidedSource}</span></div>
          <div style="margin-top:4px;"><strong>Boundary:</strong> ${m.lca.methodology.systemBoundary}</div>
        </div>
      </div>
    </div>

    <h3 style="font-size:14px;color:var(--color-text-secondary);margin:16px 0 8px;">Safety & Compliance Checklist</h3>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span class="risk-badge risk-${m.contaminationRisk}">Contamination Risk: ${m.contaminationRisk}</span>
    </div>
    <ul class="checklist">
      ${m.safetyChecklist.map((item) => `
        <li>
          <span class="check-icon check-${item.status}">${checkIcon(item.status)}</span>
          <span>${item.description}</span>
        </li>
      `).join("")}
    </ul>

    <div style="margin-top:20px;display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="alert('Match accepted (demo). In production, this triggers contract workflow and audit entry.')">Accept Match</button>
      <button class="btn btn-secondary" onclick="document.getElementById('match-modal').style.display='none'">Close</button>
    </div>
  `;

  modal.style.display = "flex";
};

document.getElementById("btn-close-modal").addEventListener("click", () => {
  document.getElementById("match-modal").style.display = "none";
});

document.querySelector(".modal-backdrop")?.addEventListener("click", () => {
  document.getElementById("match-modal").style.display = "none";
});

// ── Listings ──────────────────────────────────────────────────────────

async function loadListings() {
  feedstocks = await fetchJSON("/feedstocks");
  processors = await fetchJSON("/processors");

  document.getElementById("feedstocks-list").innerHTML = feedstocks.map((f) => `
    <div class="listing-card">
      <h4>${f.name}</h4>
      <div class="listing-meta">${formatCategory(f.category)} / ${f.subtype} &middot; ${f.region}</div>
      <dl class="listing-detail">
        <dt>Volume</dt><dd>${f.volumeTonnesPerMonth} t/mo</dd>
        <dt>Moisture</dt><dd>${f.composition.moisturePct}%</dd>
        <dt>C:N Ratio</dt><dd>${f.composition.cnRatio}</dd>
        <dt>Dry Matter</dt><dd>${f.composition.dryMatterPct}%</dd>
        <dt>Baseline</dt><dd>${f.baselineScenario.replace(/_/g, " ")}</dd>
        <dt>Status</dt><dd>${f.status}</dd>
      </dl>
      <div style="margin-top:8px;">
        ${f.certifications.map((c) => `<span class="tag">${c}</span>`).join("")}
        ${f.contaminationFlags.heavyMetals ? '<span class="tag" style="color:var(--color-danger);">heavy metals</span>' : ""}
        ${f.contaminationFlags.plasticFragments ? '<span class="tag" style="color:var(--color-warning);">plastic</span>' : ""}
        ${f.contaminationFlags.pathogens ? '<span class="tag" style="color:var(--color-danger);">pathogens</span>' : ""}
      </div>
    </div>
  `).join("");

  document.getElementById("processors-list").innerHTML = processors.map((p) => {
    const available = Math.round(p.intakeCapacityTonnesPerMonth * (1 - p.currentUtilizationPct / 100));
    return `
      <div class="listing-card">
        <h4>${p.name}</h4>
        <div class="listing-meta">${formatTechnology(p.technology)} &middot; ${p.region}</div>
        <dl class="listing-detail">
          <dt>Capacity</dt><dd>${p.intakeCapacityTonnesPerMonth} t/mo</dd>
          <dt>Available</dt><dd>${available} t/mo</dd>
          <dt>Utilization</dt><dd>${p.currentUtilizationPct}%</dd>
          <dt>Service Radius</dt><dd>${p.serviceRadiusKm} km</dd>
          <dt>Moisture Range</dt><dd>${p.compositionTolerance.moistureRange.join("–")}%</dd>
          <dt>C:N Range</dt><dd>${p.compositionTolerance.cnRange.join("–")}</dd>
        </dl>
        <div style="margin-top:8px;">
          ${p.certifications.map((c) => `<span class="tag">${c}</span>`).join("")}
          ${p.permits.map((c) => `<span class="tag">${c}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");
}

// ── Audit Trail ───────────────────────────────────────────────────────

async function loadAudit() {
  const data = await fetchJSON("/audit?limit=200");
  const entries = data.entries || [];

  const container = document.getElementById("audit-table-container");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Action</th>
          <th>Entity</th>
          <th>Actor</th>
          <th>Reason</th>
          <th>Checksum</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((e) => `
          <tr>
            <td>${new Date(e.timestamp).toLocaleString()}</td>
            <td><span class="tag">${e.action}</span></td>
            <td>${e.entityType}:${e.entityId.substring(0, 8)}...</td>
            <td>${e.actor}</td>
            <td>${e.reason}</td>
            <td title="${e.checksum}">${e.checksum.substring(0, 12)}...</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("btn-verify-chain")?.addEventListener("click", async () => {
  const result = await fetchJSON("/audit/verify");
  const el = document.getElementById("chain-status");
  if (result.valid) {
    el.textContent = `Chain verified: ${result.totalEntries} entries, all checksums valid`;
    el.className = "chain-status chain-valid";
  } else {
    el.textContent = `Chain BROKEN at entry ${result.brokenAt}`;
    el.className = "chain-status chain-invalid";
  }
});

document.getElementById("btn-export-audit")?.addEventListener("click", () => {
  window.open(API + "/audit/export?format=csv", "_blank");
});

// ── LCA Methodology ──────────────────────────────────────────────────

async function loadMethodology() {
  const data = await fetchJSON("/impact/methodology");
  const container = document.getElementById("methodology-content");

  function renderFactorTable(title, factors, valueLabel) {
    const rows = Object.entries(factors).map(([key, val]) => `
      <tr>
        <td>${key.replace(/_/g, " ")}</td>
        <td>${val.factor}</td>
        <td class="factor-source">${val.source || val.displaced || ""}</td>
      </tr>
    `).join("");

    return `
      <div class="methodology-section">
        <h3>${title}</h3>
        <table class="factor-table">
          <thead><tr><th>Key</th><th>${valueLabel}</th><th>Source</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="methodology-section">
      <h3>System Boundary</h3>
      <p style="font-size:13px;line-height:1.6;">${data.systemBoundary}</p>
      <p style="font-size:13px;line-height:1.6;margin-top:8px;">Uncertainty: ${data.uncertaintyMethod}</p>
      <h4 style="margin-top:12px;font-size:13px;color:var(--color-text-secondary);">References</h4>
      <ul style="font-size:12px;margin-top:4px;padding-left:16px;color:var(--color-text-secondary);">
        ${data.references.map((r) => `<li>${r}</li>`).join("")}
      </ul>
    </div>
    ${renderFactorTable("Baseline Emission Factors", data.factors.baseline, "kg CO₂e / tonne")}
    ${renderFactorTable("Transport Emission Factors", data.factors.transport, "kg CO₂e / tonne-km")}
    ${renderFactorTable("Processing Emission Factors", data.factors.processing, "kg CO₂e / tonne input")}
    ${renderFactorTable("Avoided Emission Credits", data.factors.avoided, "kg CO₂e / tonne input")}
    <div class="methodology-section">
      <h3>Global Warming Potentials</h3>
      <p style="font-size:13px;">CH₄ 100-year GWP (IPCC AR6): <strong>${data.factors.gwp.ch4_100yr_ar6}</strong></p>
    </div>
  `;
}

// ── Utility functions ─────────────────────────────────────────────────

function formatNumber(n) {
  if (typeof n !== "number" || isNaN(n)) return "--";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function formatCategory(cat) {
  const map = {
    food_waste: "Food Waste",
    ag_residue: "Ag Residue",
    forestry_residue: "Forestry Residue",
    manure: "Manure",
  };
  return map[cat] || cat;
}

function formatTechnology(tech) {
  const map = {
    composting_windrow: "Composting (Windrow)",
    composting_in_vessel: "Composting (In-Vessel)",
    composting_vermicompost: "Vermicompost",
    ad_mesophilic: "AD (Mesophilic)",
    ad_thermophilic: "AD (Thermophilic)",
    ad_dry: "AD (Dry)",
    biorefinery_ethanol: "Biorefinery (Ethanol)",
    biorefinery_biochemical: "Biorefinery (Biochem)",
    pyrolysis: "Pyrolysis",
    gasification: "Gasification",
    animal_feed: "Animal Feed",
  };
  return map[tech] || tech;
}

function checkIcon(status) {
  const icons = { PASS: "\u2713", FAIL: "\u2717", NEEDS_REVIEW: "?", NOT_APPLICABLE: "\u2014" };
  return icons[status] || "?";
}

// ── Initialize ────────────────────────────────────────────────────────

loadDashboard();
