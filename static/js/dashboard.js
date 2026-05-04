/* ============================================================
   dashboard.js — Real-time polling & Chart.js rendering
   ============================================================ */

const API = {
  snapshot:  "/api/snapshot",
  history:   "/api/history",
  alerts:    "/api/alerts",
  processes: "/api/processes",
  config:    "/api/config",
};

let CFG = { cpu_threshold: 80, memory_threshold: 80, disk_threshold: 90, collect_interval: 2 };

// ── Chart defaults ──────────────────────────────────────────
const MAX_POINTS = 75;

function makeDataset(label, color, fill = true) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: fill ? color + "18" : "transparent",
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.4,
    fill,
  };
}

const chartOpts = (yMax = 100, thresholdVal = null, thresholdColor = "#ff4d6d") => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(8,13,24,0.92)",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      titleColor: "#94a3b8",
      bodyColor: "#f0f4ff",
      padding: 10,
    },
    annotation: thresholdVal
      ? {
          annotations: {
            threshold: {
              type: "line",
              yMin: thresholdVal,
              yMax: thresholdVal,
              borderColor: thresholdColor + "aa",
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                content: `Threshold: ${thresholdVal}%`,
                display: true,
                position: "end",
                color: thresholdColor,
                font: { size: 10 },
                backgroundColor: "transparent",
              },
            },
          },
        }
      : {},
  },
  scales: {
    x: {
      ticks: { color: "#475569", maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 10 } },
      grid: { color: "rgba(255,255,255,0.04)" },
    },
    y: {
      min: 0,
      max: yMax,
      ticks: { color: "#475569", font: { family: "JetBrains Mono", size: 10 } },
      grid: { color: "rgba(255,255,255,0.06)" },
    },
  },
});

// ── Create Charts ───────────────────────────────────────────
const cpuChart = new Chart(document.getElementById("cpuChart"), {
  type: "line",
  data: { labels: [], datasets: [makeDataset("CPU %", "#6ee7f7")] },
  options: chartOpts(100, 80, "#ff4d6d"),
});

const memChart = new Chart(document.getElementById("memChart"), {
  type: "line",
  data: { labels: [], datasets: [makeDataset("RAM %", "#a78bfa")] },
  options: chartOpts(100, 80, "#ff4d6d"),
});

const diskChart = new Chart(document.getElementById("diskChart"), {
  type: "line",
  data: { labels: [], datasets: [makeDataset("Disk %", "#34d399")] },
  options: chartOpts(100, 90, "#f59e0b"),
});

const netChart = new Chart(document.getElementById("netChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      makeDataset("Sent KB/s", "#f59e0b", false),
      makeDataset("Recv KB/s", "#60a5fa", false),
    ],
  },
  options: chartOpts(undefined, null),
});
// Remove fixed y-max for net chart (auto scale)
netChart.options.scales.y.max = undefined;

// ── Helper: format time label ────────────────────────────────
function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pushPoint(chart, label, ...values) {
  chart.data.labels.push(label);
  values.forEach((v, i) => chart.data.datasets[i].data.push(v));
  while (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.shift?.() || ds.data.shift());
  }
  chart.update("none");
}

// ── Stat card helpers ────────────────────────────────────────
function setCard(id, valText, barId, pct, subText, alertBadgeId) {
  const card = document.getElementById(id);
  const valEl = document.getElementById(id.replace("card-", "") + "Val");
  const barEl = document.getElementById(barId);
  const subEl = document.getElementById(id.replace("card-", "") + "Sub");
  const badgeEl = alertBadgeId ? document.getElementById(alertBadgeId) : null;

  if (valEl) valEl.textContent = valText;
  if (barEl) barEl.style.width = Math.min(pct, 100) + "%";
  if (subEl && subText) subEl.textContent = subText;

  const isAlert = pct >= (id.includes("cpu") ? CFG.cpu_threshold : id.includes("mem") ? CFG.memory_threshold : CFG.disk_threshold);
  if (card) card.classList.toggle("danger", isAlert);
  if (badgeEl) {
    badgeEl.textContent = isAlert ? "ALERT" : "";
    badgeEl.classList.toggle("alert-on", isAlert);
  }
}

// ── Snapshot update ──────────────────────────────────────────
async function fetchSnapshot() {
  try {
    const res = await fetch(API.snapshot);
    if (!res.ok) return;
    const d = await res.json();
    if (!d.ts) return;

    const lbl = fmtTime(d.ts);

    // Stat cards
    setCard("card-cpu",  `${d.cpu}%`,  "cpuBar",  d.cpu,  `Threshold: ${CFG.cpu_threshold}%`, "cpuAlert");
    setCard("card-mem",  `${d.mem}%`,  "memBar",  d.mem,  `${d.mem_used} GB / ${d.mem_total} GB`, "memAlert");
    setCard("card-disk", `${d.disk}%`, "diskBar", d.disk, `${d.disk_used} GB / ${d.disk_total} GB`, "diskAlert");

    // Network card
    const totalKB = (d.net_sent + d.net_recv).toFixed(1);
    document.getElementById("netVal").textContent   = `${totalKB} KB/s`;
    document.getElementById("netSent").textContent  = `${d.net_sent} KB/s`;
    document.getElementById("netRecv").textContent  = `${d.net_recv} KB/s`;

    // Push to charts
    pushPoint(cpuChart,  lbl, d.cpu);
    pushPoint(memChart,  lbl, d.mem);
    pushPoint(diskChart, lbl, d.disk);
    pushPoint(netChart,  lbl, d.net_sent, d.net_recv);

    // Status pill
    const pill = document.getElementById("statusPill");
    const txt  = document.getElementById("statusText");
    pill.className = "status-pill live";
    txt.textContent = "Live — updating every 2s";
  } catch (e) {
    const pill = document.getElementById("statusPill");
    const txt  = document.getElementById("statusText");
    pill.className = "status-pill";
    txt.textContent = "Connection lost — retrying…";
  }
}

// ── Alerts update ────────────────────────────────────────────
async function fetchAlerts() {
  try {
    const res = await fetch(API.alerts);
    const data = await res.json();

    const list  = document.getElementById("alertsList");
    const badge = document.getElementById("alertCount");
    badge.textContent = data.length;

    if (data.length === 0) {
      list.innerHTML = `<div class="no-alerts">✅ All systems normal</div>`;
      return;
    }

    list.innerHTML = data.map(a => `
      <div class="alert-item">
        <div class="a-msg">${a.message}</div>
        <div class="a-time">${fmtTime(a.ts)}</div>
      </div>`).join("");
  } catch (_) {}
}

// ── Process table update ─────────────────────────────────────
async function fetchProcesses() {
  try {
    const res   = await fetch(API.processes);
    const procs = await res.json();
    const tbody = document.getElementById("procBody");

    if (!procs.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No data</td></tr>`;
      return;
    }

    tbody.innerHTML = procs.map(p => {
      const cpuClass = p.cpu > 50 ? "cpu-crit" : p.cpu > 20 ? "cpu-warn" : "cpu-hot";
      const statusClass = p.status === "running" ? "status-running" : p.status === "sleeping" ? "status-sleep" : "status-zombie";
      return `<tr>
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td class="${cpuClass}">${p.cpu}%</td>
        <td>${p.mem}%</td>
        <td class="${statusClass}">${p.status}</td>
      </tr>`;
    }).join("");
  } catch (_) {}
}

// ── Clock ────────────────────────────────────────────────────
function updateClock() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("en-US", { hour12: false });
}

// ── Load history on start ─────────────────────────────────────
async function loadHistory() {
  try {
    const res  = await fetch(API.history);
    const data = await res.json();
    data.forEach(d => {
      const lbl = fmtTime(d.ts);
      cpuChart.data.labels.push(lbl);
      cpuChart.data.datasets[0].data.push(d.cpu);
      memChart.data.labels.push(lbl);
      memChart.data.datasets[0].data.push(d.mem);
      diskChart.data.labels.push(lbl);
      diskChart.data.datasets[0].data.push(d.disk);
      netChart.data.labels.push(lbl);
      netChart.data.datasets[0].data.push(d.net_sent);
      netChart.data.datasets[1].data.push(d.net_recv);
    });
    cpuChart.update();
    memChart.update();
    diskChart.update();
    netChart.update();
  } catch (_) {}
}

// ── Load config ───────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch(API.config);
    CFG = await res.json();
    // Update threshold annotations
    [cpuChart, memChart].forEach(c => {
      if (c.options.plugins.annotation?.annotations?.threshold) {
        c.options.plugins.annotation.annotations.threshold.yMin = CFG.cpu_threshold;
        c.options.plugins.annotation.annotations.threshold.yMax = CFG.cpu_threshold;
      }
    });
  } catch (_) {}
}

// ── Bootstrap ─────────────────────────────────────────────────
(async () => {
  await loadConfig();
  await loadHistory();
  await fetchSnapshot();
  await fetchAlerts();
  await fetchProcesses();

  updateClock();
  setInterval(updateClock,    1000);
  setInterval(fetchSnapshot,  2000);
  setInterval(fetchAlerts,    4000);
  setInterval(fetchProcesses, 5000);
})();
