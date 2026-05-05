# PulseDash — Real-Time SRE Observability Dashboard

> A production-inspired SRE monitoring dashboard built with **Python (psutil)**, **Flask**, and **Chart.js**. Implements the three pillars of observability — **Metrics**, **Logs**, and **Traces** — alongside SLO tracking, incident management, and statistical anomaly detection.

![Status](https://img.shields.io/badge/Status-Live-34d399?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.9+-6ee7f7?style=flat-square&logo=python)
![Flask](https://img.shields.io/badge/Flask-2.3-a78bfa?style=flat-square&logo=flask)
![License](https://img.shields.io/badge/License-MIT-64748b?style=flat-square)

---

## ⚡ Features

| Feature | Details |
|---|---|
| 📊 **Live Charts** | CPU, Memory, Disk, Network — updated every 2s via Chart.js |
| 🚨 **Severity Alerting** | P1/P2/P3 threshold system (INFO → WARNING → CRITICAL) with runbooks |
| 📋 **SLO Tracking** | Compliance %, error budget remaining, burn rate per objective |
| 🔥 **Incident Management** | Auto-open/close incidents with MTTD and MTTR calculation |
| 🔬 **Anomaly Detection** | Z-score statistical detection (≥2.5σ) over a rolling window |
| 🔍 **Process Monitor** | Top 10 processes by CPU, live refresh |
| 🌐 **Prometheus Metrics** | `/metrics` endpoint in Prometheus text-exposition format |
| 🏥 **Health Check** | `/health` returns 200/503 — k8s/load-balancer ready |
| 📝 **Structured Logging** | JSON log lines for every event — ingestible by any log aggregator |
| 📓 **Change Log** | `/api/changelog` tracks deployment/config change events |
| 🎨 **Dark UI** | Glassmorphism design with animated indicators |
| 📱 **Responsive** | Works on desktop and mobile |

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/ansu647/pulsedash.git
cd pulsedash

# 2. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the dashboard
python app.py
```

Open → **http://localhost:5050**

---

## 📁 Project Structure

```
pulsedash/
├── app.py                    # Flask app — all API routes
├── config.py                 # Thresholds, SLO definitions, runbooks
├── requirements.txt
├── monitor/
│   ├── __init__.py
│   ├── collector.py          # psutil metrics collector (background thread)
│   ├── slo.py                # SLO tracker — compliance, error budget, burn rate
│   ├── incident.py           # Incident lifecycle — MTTD / MTTR
│   ├── anomaly.py            # Z-score statistical anomaly detector
│   └── logger.py             # Structured JSON logger
├── static/
│   ├── css/style.css         # Dark glassmorphism UI
│   └── js/dashboard.js       # Chart.js + real-time polling
├── templates/
│   └── index.html            # Flask dashboard template
└── docs/                     # GitHub Pages static demo
    └── index.html
```

---

## ⚙️ Configuration

All thresholds and SLO definitions are in `config.py`:

```python
class Config:
    # ── Flask ────────────────────────────────────────
    PORT             = 5050
    DEBUG            = False

    # ── Collection ───────────────────────────────────
    COLLECT_INTERVAL = 2     # seconds between psutil samples
    HISTORY_SECONDS  = 300   # rolling window kept in memory (5 min)

    # ── Severity thresholds (%) ──────────────────────
    # Three levels per resource: INFO (P3) → WARNING (P2) → CRITICAL (P1)
    THRESHOLDS = {
        "cpu":    {"info": 60, "warning": 80, "critical": 95},
        "memory": {"info": 70, "warning": 85, "critical": 95},
        "disk":   {"info": 70, "warning": 85, "critical": 95},
    }

    # ── SLO Definitions ──────────────────────────────
    SLOS = {
        "cpu_availability":    {"target_pct": 99.0, "threshold": 80, ...},
        "memory_availability": {"target_pct": 99.5, "threshold": 90, ...},
        "disk_availability":   {"target_pct": 99.9, "threshold": 85, ...},
    }
```

---

## 🌐 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Dashboard UI |
| `/health` | GET | Health check — 200 (healthy) or 503 (degraded) |
| `/metrics` | GET | Prometheus text-format metrics |
| `/api/snapshot` | GET | Latest single metrics snapshot |
| `/api/history` | GET | Full rolling history (up to 5 min) |
| `/api/alerts` | GET | Recent threshold-breach alerts with severity + runbook |
| `/api/slos` | GET | SLO compliance, error budget, burn rate per objective |
| `/api/incidents` | GET | Incident log (active + closed), MTTR, MTTD |
| `/api/anomalies` | GET | Statistical anomaly events (Z-score ≥ 2.5σ) + baseline stats |
| `/api/changelog` | GET | Deployment/config change event log |
| `/api/processes` | GET | Top 10 processes by CPU usage |
| `/api/config` | GET | Current threshold configuration |
| `/api/summary` | GET | Health score, uptime, incident counts, SLO breaches |

---

## 🛠️ SRE Concepts Implemented

### Observability (3 Pillars)
| Pillar | Implementation |
|---|---|
| **Metrics** | psutil → `/api/snapshot`, `/api/history`, `/metrics` (Prometheus) |
| **Logs** | `StructuredLogger` emits JSON to stdout — ingestible by Loki/ELK |
| **Events** | Alerts, incidents, anomalies all timestamped in memory |

### SLO / Error Budget
- Each resource has a defined **SLO target** (e.g. 99.9% of samples below threshold)
- **Error budget remaining** is calculated as `(1 − budget_used) × 100`
- **Burn rate** > 1× means budget depleting faster than sustainable
- Status: `OK` → `AT_RISK` → `BREACHED`

### Incident Management
- Incidents auto-open when a metric breaches its `CRITICAL` threshold
- Incidents auto-close on recovery — **duration** is recorded
- **MTTD** (Mean Time To Detect): equal to sample interval (2s)
- **MTTR** (Mean Time To Recover): mean duration across all closed incidents

### Anomaly Detection
- **Z-score** computed over a 60-sample (~2-minute) rolling window
- A sample is flagged when `|z| ≥ 2.5σ` (configurable)
- Events record direction (`HIGH`/`LOW`), magnitude, mean, and stddev
- Baseline stats (μ, σ, n) are exposed per resource via `/api/anomalies`

### Health Score
Composite 0–100 score derived from:
- −10 for each WARNING metric
- −25 for each CRITICAL metric
- −5 for each active incident

Used by `/health` to return 200 (≥50) or 503 (<50).

### Prometheus Integration
`/metrics` exposes all metrics in Prometheus text format, including:
- `pulsedash_cpu_percent`, `pulsedash_memory_percent`, `pulsedash_disk_percent`
- `pulsedash_network_sent_kbps`, `pulsedash_network_recv_kbps`
- `pulsedash_health_score`, `pulsedash_active_incidents`
- `pulsedash_slo_<name>_compliance`, `pulsedash_slo_<name>_error_budget_remaining`

---

## 🔮 Possible Extensions

- Wire `/api/changelog` to a CI/CD webhook for real deployment tracking
- Persist metrics to **InfluxDB** or **TimescaleDB** for long-term retention
- Add **PagerDuty / Slack** webhook on CRITICAL incident open
- Replace the Z-score detector with **Prophet** or **Isolation Forest**
- Add **authentication** (Flask-Login / OAuth2) for multi-tenant use

---

## 📄 License

MIT — free to use, modify, and distribute.
