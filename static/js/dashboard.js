/* ============================================================
   dashboard.js — SRE Edition
   Polls /api/snapshot, /api/alerts, /api/slos, /api/incidents,
   /api/summary, /api/processes every few seconds.
   ============================================================ */

const API = {
  snapshot:  "/api/snapshot",
  history:   "/api/history",
  alerts:    "/api/alerts",
  processes: "/api/processes",
  slos:      "/api/slos",
  incidents: "/api/incidents",
  summary:   "/api/summary",
};

const MAX_POINTS = 75;

// ── Chart factory ────────────────────────────────────────────
function mkDS(label, color, fill = true) {
  return {
    label, data: [],
    borderColor: color,
    backgroundColor: fill ? color + "18" : "transparent",
    borderWidth: 2, pointRadius: 0, tension: 0.4, fill,
  };
}
const chartOpts = (yMax) => ({
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(8,13,24,.92)", borderColor: "rgba(255,255,255,.1)",
      borderWidth: 1, titleColor: "#94a3b8", bodyColor: "#f0f4ff", padding: 10,
    },
  },
  scales: {
    x: { ticks: { color: "#475569", maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(255,255,255,.04)" } },
    y: { min: 0, max: yMax, ticks: { color: "#475569", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(255,255,255,.06)" } },
  },
});

const cpuChart  = new Chart(document.getElementById("cpuChart"),  { type: "line", data: { labels: [], datasets: [mkDS("CPU %", "#6ee7f7")] }, options: chartOpts(100) });
const memChart  = new Chart(document.getElementById("memChart"),  { type: "line", data: { labels: [], datasets: [mkDS("RAM %", "#a78bfa")] }, options: chartOpts(100) });
const diskChart = new Chart(document.getElementById("diskChart"), { type: "line", data: { labels: [], datasets: [mkDS("Disk %", "#34d399")] }, options: chartOpts(100) });
const netChart  = new Chart(document.getElementById("netChart"),  { type: "line", data: { labels: [], datasets: [mkDS("Sent", "#f59e0b", false), mkDS("Recv", "#60a5fa", false)] }, options: chartOpts(undefined) });
netChart.options.scales.y.max = undefined;

function pushChart(chart, label, ...vals) {
  chart.data.labels.push(label);
  vals.forEach((v, i) => chart.data.datasets[i].data.push(v));
  while (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update("none");
}

// ── Time helpers ─────────────────────────────────────────────
function fmtTime(ts) {
  return new Date((ts || Date.now() / 1000) * 1000)
    .toLocaleTimeString("en-US", { hour12: false });
}

function fmtDuration(s) {
  if (s === null || s === undefined) return "--";
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function fmtUptime(s) {
  if (!s) return "--";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ── Severity helpers ──────────────────────────────────────────
const SEV_CLASS = { OK: "sev-OK", INFO: "sev-INFO", WARNING: "sev-WARNING", CRITICAL: "sev-CRITICAL" };
const CARD_SEV  = { OK: "", INFO: "", WARNING: "sev-warning", CRITICAL: "sev-critical" };

function setBadge(id, sev) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = sev;
  el.className = "sev-badge " + (SEV_CLASS[sev] || "sev-OK");
}

function setCard(cardId, sev) {
  const el = document.getElementById(cardId);
  if (!el) return;
  el.className = "stat-card " + (CARD_SEV[sev] || "");
}

// ── Snapshot update ───────────────────────────────────────────
async function fetchSnapshot() {
  try {
    const d = await fetch(API.snapshot).then(r => r.json());
    if (!d.ts) return;

    const lbl = fmtTime(d.ts);

    // CPU card
    document.getElementById("cpuVal").textContent = `${d.cpu}%`;
    document.getElementById("cpuBar").style.width = Math.min(d.cpu, 100) + "%";
    setBadge("cpuSev", d.cpu_sev || "OK");
    setCard("card-cpu", d.cpu_sev || "OK");

    // Memory card
    document.getElementById("memVal").textContent = `${d.mem}%`;
    document.getElementById("memBar").style.width = Math.min(d.mem, 100) + "%";
    document.getElementById("memSub").textContent = `${d.mem_used} GB / ${d.mem_total} GB`;
    setBadge("memSev", d.mem_sev || "OK");
    setCard("card-mem", d.mem_sev || "OK");

    // Disk card
    document.getElementById("diskVal").textContent = `${d.disk}%`;
    document.getElementById("diskBar").style.width = Math.min(d.disk, 100) + "%";
    document.getElementById("diskSub").textContent = `${d.disk_used} GB / ${d.disk_total} GB`;
    setBadge("diskSev", d.disk_sev || "OK");
    setCard("card-disk", d.disk_sev || "OK");

    // Network card
    const totalKB = (d.net_sent + d.net_recv).toFixed(1);
    document.getElementById("netVal").textContent  = `${totalKB} KB/s`;
    document.getElementById("netSent").textContent = `${d.net_sent} KB/s`;
    document.getElementById("netRecv").textContent = `${d.net_recv} KB/s`;

    // Charts
    pushChart(cpuChart,  lbl, d.cpu);
    pushChart(memChart,  lbl, d.mem);
    pushChart(diskChart, lbl, d.disk);
    pushChart(netChart,  lbl, d.net_sent, d.net_recv);

    // Status pill
    document.getElementById("statusPill").className = "status-pill live";
    document.getElementById("statusText").textContent = "Live — updating every 2s";

  } catch (_) {
    document.getElementById("statusPill").className = "status-pill";
    document.getElementById("statusText").textContent = "Connection lost — retrying…";
  }
}

// ── Summary / KPIs ─────────────────────────────────────────────
async function fetchSummary() {
  try {
    const s = await fetch(API.summary).then(r => r.json());

    // Health score chip
    const chip = document.getElementById("healthChip");
    const hs   = document.getElementById("healthScore");
    hs.textContent = s.health_score;
    chip.className = s.health_score >= 80 ? "health-score-chip"
                   : s.health_score >= 50 ? "health-score-chip hs-warning"
                   : "health-score-chip hs-critical";

    document.getElementById("summaryUptime").textContent    = fmtUptime(s.uptime_seconds);
    document.getElementById("summaryMTTR").textContent      = fmtDuration(s.mttr_s);

    // Active incidents
    const incEl = document.getElementById("summaryIncidents");
    incEl.textContent = s.active_incidents;
    incEl.closest(".sre-card").className = s.active_incidents > 0
      ? "sre-card src-danger" : "sre-card src-ok";

    // SLO summary
    const sloBrEl = document.getElementById("summarySloBreached");
    sloBrEl.textContent = s.slo_breached;
    sloBrEl.closest(".sre-card").className = s.slo_breached > 0
      ? "sre-card src-danger" : "sre-card src-ok";
    document.getElementById("summarySloOk").textContent = s.slo_ok;

  } catch (_) {}
}

// ── SLO panel ─────────────────────────────────────────────────
async function fetchSLOs() {
  try {
    const slos = await fetch(API.slos).then(r => r.json());
    const grid = document.getElementById("sloGrid");
    const cards = Object.entries(slos).map(([key, s]) => {
      if (s.status === "INITIALIZING") {
        return `<div class="slo-card">
          <div class="slo-header">
            <span class="slo-name">${key.replace(/_/g," ")}</span>
            <span class="slo-status-pill slo-INITIALIZING">Init…</span>
          </div>
          <div class="slo-compliance">--%</div>
        </div>`;
      }

      const budgetPct = s.error_budget_rem;
      const budgetClass = budgetPct > 50 ? "budget-high" : budgetPct > 20 ? "budget-mid" : "budget-low";
      const burnLabel   = s.burn_rate >= 1 ? `🔥 Burn rate: ${s.burn_rate}×` : `Burn rate: ${s.burn_rate}×`;
      const statusColor = s.status === "OK" ? "slo-OK" : s.status === "AT_RISK" ? "slo-AT_RISK" : "slo-BREACHED";
      const compliance  = s.compliance_pct?.toFixed(3) || "--";

      return `<div class="slo-card">
        <div class="slo-header">
          <span class="slo-name">${s.display || key}</span>
          <span class="slo-status-pill ${statusColor}">${s.status}</span>
        </div>
        <div class="slo-compliance">${compliance}%</div>
        <div class="slo-target">Target: ${s.target_pct}% &nbsp;|&nbsp; ${s.samples_good}/${s.samples_total} samples good</div>
        <div class="budget-bar-wrap">
          <div class="budget-bar ${budgetClass}" style="width:${budgetPct}%"></div>
        </div>
        <div class="budget-meta">
          <span>Error budget: ${budgetPct}% remaining</span>
          <span>${burnLabel}</span>
        </div>
        ${s.runbook ? `<div class="slo-runbook">📖 ${s.runbook}</div>` : ""}
      </div>`;
    });
    grid.innerHTML = cards.join("") || `<div class="slo-loading">No SLOs defined</div>`;
  } catch (_) {}
}

// ── Alerts with severity + runbook ────────────────────────────
async function fetchAlerts() {
  try {
    const data  = await fetch(API.alerts).then(r => r.json());
    const list  = document.getElementById("alertsList");
    const badge = document.getElementById("alertCount");
    badge.textContent = data.length;

    if (!data.length) {
      list.innerHTML = `<div class="no-alerts">✅ All systems normal</div>`;
      return;
    }

    list.innerHTML = data.map(a => `
      <div class="alert-item sev-${a.severity}">
        <div class="a-header">
          <span class="a-sev a-sev-${a.severity}">${a.severity}</span>
          <span class="a-msg">${a.message}</span>
        </div>
        ${a.runbook ? `<div class="a-runbook">📖 ${a.runbook}</div>` : ""}
        <div class="a-time">${fmtTime(a.ts)}</div>
      </div>`).join("");
  } catch (_) {}
}

// ── Incident log ──────────────────────────────────────────────
async function fetchIncidents() {
  try {
    const data = await fetch(API.incidents).then(r => r.json());
    const list = document.getElementById("incidentsList");
    const badge= document.getElementById("incidentCount");
    const all  = data.history || [];
    badge.textContent = data.active?.length || 0;

    if (!all.length) {
      list.innerHTML = `<div class="no-alerts">✅ No incidents recorded</div>`;
      return;
    }

    list.innerHTML = all.map(inc => {
      const isClosed = inc.status === "CLOSED";
      const dur = isClosed ? ` · ${fmtDuration(inc.duration_s)}` : " · ONGOING";
      return `<div class="inc-item ${isClosed ? "closed" : ""}">
        <div class="inc-id">${inc.id} <span style="font-size:.6rem;opacity:.6">${inc.status}</span></div>
        <div class="inc-resource">${inc.resource} at ${inc.value?.toFixed(1)}%${dur}</div>
        <div class="inc-meta">${fmtTime(inc.opened_at)}${isClosed ? " → " + fmtTime(inc.closed_at) : " → open"}</div>
      </div>`;
    }).join("");

  } catch (_) {}
}

// ── Process table ─────────────────────────────────────────────
async function fetchProcesses() {
  try {
    const procs = await fetch(API.processes).then(r => r.json());
    const tbody = document.getElementById("procBody");
    tbody.innerHTML = procs.map(p => {
      const cc = p.cpu > 50 ? "cpu-crit" : p.cpu > 20 ? "cpu-warn" : "cpu-hot";
      const sc = p.status === "running" ? "status-running" : "status-sleep";
      return `<tr>
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td class="${cc}">${p.cpu}%</td>
        <td>${p.mem}%</td>
        <td class="${sc}">${p.status}</td>
      </tr>`;
    }).join("");
  } catch (_) {}
}

// ── History preload ───────────────────────────────────────────
async function loadHistory() {
  try {
    const hist = await fetch(API.history).then(r => r.json());
    hist.forEach(d => {
      const lbl = fmtTime(d.ts);
      cpuChart.data.labels.push(lbl);  cpuChart.data.datasets[0].data.push(d.cpu);
      memChart.data.labels.push(lbl);  memChart.data.datasets[0].data.push(d.mem);
      diskChart.data.labels.push(lbl); diskChart.data.datasets[0].data.push(d.disk);
      netChart.data.labels.push(lbl);  netChart.data.datasets[0].data.push(d.net_sent);
      netChart.data.datasets[1].data.push(d.net_recv);
    });
    [cpuChart, memChart, diskChart, netChart].forEach(c => c.update());
  } catch (_) {}
}

// ── Clock ─────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("en-US", { hour12: false });
}, 1000);

// ── Bootstrap ─────────────────────────────────────────────────
(async () => {
  await loadHistory();
  await fetchSnapshot();
  await fetchSummary();
  await fetchSLOs();
  await fetchAlerts();
  await fetchIncidents();
  await fetchProcesses();

  setInterval(fetchSnapshot,  2000);
  setInterval(fetchSummary,   5000);
  setInterval(fetchSLOs,      5000);
  setInterval(fetchAlerts,    4000);
  setInterval(fetchIncidents, 6000);
  setInterval(fetchProcesses, 8000);
})();
