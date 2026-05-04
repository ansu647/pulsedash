"""
app.py — PulseDash Flask application (SRE-grade)
API surface:
  GET /              → Dashboard UI
  GET /health        → Health check (returns 200 OK or 503)
  GET /metrics       → Prometheus text metrics
  GET /api/snapshot  → Latest metrics snapshot
  GET /api/history   → Rolling metric history
  GET /api/alerts    → Recent alerts with severity + runbook
  GET /api/slos      → SLO compliance + error budget report
  GET /api/incidents → Incident log (open + closed)
  GET /api/processes → Top processes by CPU
  GET /api/config    → Threshold configuration
  GET /api/summary   → Health score + uptime + SRE summary
"""

import time
from flask import Flask, jsonify, render_template, Response
from flask_cors import CORS
from monitor.collector import MetricsCollector
from monitor.logger import logger
from config import Config

app = Flask(__name__)
CORS(app)

collector = MetricsCollector()

# ──────────────────────────────────────────────────────────────
# Health Check  (SRE must-have)
# ──────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    """
    Standard health-check endpoint.
    Returns 200 + "healthy" when system health score ≥ 50.
    Returns 503 + "degraded" when health score < 50.
    Used by load balancers, uptime monitors, and k8s probes.
    """
    score  = collector.health_score()
    active = collector.active_incidents()
    status = "healthy" if score >= 50 else "degraded"
    code   = 200 if status == "healthy" else 503

    payload = {
        "status":           status,
        "health_score":     score,
        "active_incidents": len(active),
        "uptime_seconds":   collector.uptime_seconds(),
        "timestamp":        time.time(),
    }
    logger.info("Health check", **payload)
    return jsonify(payload), code


# ──────────────────────────────────────────────────────────────
# Prometheus Metrics  (observability pillar: metrics scraping)
# ──────────────────────────────────────────────────────────────

@app.route("/metrics")
def metrics():
    """Prometheus-compatible text exposition format."""
    return Response(
        collector.prometheus_metrics(),
        mimetype="text/plain; version=0.0.4; charset=utf-8"
    )


# ──────────────────────────────────────────────────────────────
# Metrics API
# ──────────────────────────────────────────────────────────────

@app.route("/api/snapshot")
def api_snapshot():
    return jsonify(collector.current_snapshot())


@app.route("/api/history")
def api_history():
    return jsonify(collector.history_data())


@app.route("/api/alerts")
def api_alerts():
    return jsonify(collector.recent_alerts())


@app.route("/api/processes")
def api_processes():
    return jsonify(collector.process_list())


@app.route("/api/config")
def api_config():
    return jsonify({
        "thresholds":      Config.THRESHOLDS,
        "collect_interval": Config.COLLECT_INTERVAL,
        "history_seconds":  Config.HISTORY_SECONDS,
    })


# ──────────────────────────────────────────────────────────────
# SRE Endpoints
# ──────────────────────────────────────────────────────────────

@app.route("/api/slos")
def api_slos():
    """SLO compliance, error budget, and burn rate for each objective."""
    return jsonify(collector.slo_report())


@app.route("/api/incidents")
def api_incidents():
    """Full incident log — open and closed."""
    return jsonify({
        "active":   collector.active_incidents(),
        "history":  collector.incidents(),
        "mttr_s":   collector.incident_manager.mttr_seconds(),
        "mttd_s":   collector.incident_manager.mttd_seconds(),
    })


@app.route("/api/summary")
def api_summary():
    """
    High-level SRE summary card — health score, uptime,
    incident counts, and SLO breaches at a glance.
    """
    slos     = collector.slo_report()
    breached = [k for k, v in slos.items() if v.get("status") == "BREACHED"]
    at_risk  = [k for k, v in slos.items() if v.get("status") == "AT_RISK"]

    return jsonify({
        "health_score":     collector.health_score(),
        "uptime_seconds":   collector.uptime_seconds(),
        "active_incidents": len(collector.active_incidents()),
        "slo_breached":     len(breached),
        "slo_at_risk":      len(at_risk),
        "slo_ok":           len(slos) - len(breached) - len(at_risk),
        "mttr_s":           collector.incident_manager.mttr_seconds(),
        "mttd_s":           collector.incident_manager.mttd_seconds(),
        "timestamp":        time.time(),
    })


# ──────────────────────────────────────────────────────────────
# UI
# ──────────────────────────────────────────────────────────────

@app.route("/")
def dashboard():
    return render_template("index.html")


# ──────────────────────────────────────────────────────────────
# Boot
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("PulseDash starting", port=Config.PORT)
    collector.start()
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
