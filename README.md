# Real-Time CPU & Memory Monitoring Dashboard

> A lightweight SRE-grade system observability dashboard built with **Python (psutil)**, **Flask**, and **Chart.js**.

![Dashboard](https://img.shields.io/badge/Status-Live-34d399?style=flat-square) ![Python](https://img.shields.io/badge/Python-3.9+-6ee7f7?style=flat-square&logo=python) ![Flask](https://img.shields.io/badge/Flask-2.3-a78bfa?style=flat-square&logo=flask)

---

## ⚡ Features

| Feature | Details |
|---|---|
| 📊 Live Charts | CPU, Memory, Disk, Network — updated every 2s via Chart.js |
| 🚨 Threshold Alerts | Auto-alerts when any metric breaches configured limits |
| 🔬 Process Monitor | Top 10 processes by CPU usage, live refresh |
| 🌐 REST API | JSON endpoints for every metric — easy to extend |
| 🎨 Dark UI | Glassmorphism design with animated indicators |
| 📱 Responsive | Works on desktop and mobile |

---

## 🚀 Quick Start

```bash
# 1. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the dashboard
python app.py
```

Then open → **http://localhost:5050**

---

## 📁 Project Structure

```
SRE/
├── app.py                  # Flask app + API routes
├── config.py               # Alert thresholds & settings
├── requirements.txt
├── monitor/
│   ├── __init__.py
│   └── collector.py        # psutil metrics collector (background thread)
├── static/
│   ├── css/style.css       # Dark glassmorphism UI
│   └── js/dashboard.js     # Chart.js + real-time polling
└── templates/
    └── index.html          # Dashboard page
```

---

## ⚙️ Configuration

Edit `config.py` to change alert thresholds:

```python
class Config:
    CPU_THRESHOLD    = 80   # Alert if CPU > 80%
    MEMORY_THRESHOLD = 80   # Alert if RAM > 80%
    DISK_THRESHOLD   = 90   # Alert if Disk > 90%
    COLLECT_INTERVAL = 2    # Sampling every 2 seconds
    HISTORY_SECONDS  = 300  # 5 minutes of rolling history
    PORT             = 5050
```

---

## 🌐 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard UI |
| `GET /api/snapshot` | Latest single metrics snapshot |
| `GET /api/history` | Full rolling history (up to 5 min) |
| `GET /api/alerts` | Recent threshold-breach alerts |
| `GET /api/processes` | Top 10 processes by CPU |
| `GET /api/config` | Threshold configuration |

---

## 🛠️ SRE Concepts Demonstrated

- **System Observability** — CPU, Memory, Disk, Network tracked in real time
- **Resource Monitoring** — psutil-based collection with configurable intervals
- **Alerting** — Threshold-based alert generation stored in memory
- **Metrics Storage** — Rolling in-memory deque (extend to InfluxDB/Prometheus)
- **Dashboard Visualization** — Live Chart.js time-series graphs
