"""
app.py — Flask application entry point.
Serves the dashboard and JSON API endpoints.
"""

from flask import Flask, jsonify, render_template
from flask_cors import CORS
from monitor.collector import MetricsCollector
from config import Config

app = Flask(__name__)
CORS(app)

collector = MetricsCollector()


# ──────────────────────────────────────────────
# API Routes
# ──────────────────────────────────────────────

@app.route("/api/snapshot")
def api_snapshot():
    """Latest single-point metrics."""
    return jsonify(collector.current_snapshot())


@app.route("/api/history")
def api_history():
    """Rolling window of all historical metrics."""
    return jsonify(collector.history())


@app.route("/api/alerts")
def api_alerts():
    """Recent threshold-breach alerts."""
    return jsonify(collector.recent_alerts())


@app.route("/api/processes")
def api_processes():
    """Top processes by CPU usage."""
    return jsonify(collector.process_list())


@app.route("/api/config")
def api_config():
    """Return threshold configuration so the frontend can draw alert lines."""
    return jsonify({
        "cpu_threshold":    Config.CPU_THRESHOLD,
        "memory_threshold": Config.MEMORY_THRESHOLD,
        "disk_threshold":   Config.DISK_THRESHOLD,
        "collect_interval": Config.COLLECT_INTERVAL,
    })


# ──────────────────────────────────────────────
# UI Route
# ──────────────────────────────────────────────

@app.route("/")
def dashboard():
    return render_template("index.html")


# ──────────────────────────────────────────────
# Start
# ──────────────────────────────────────────────

if __name__ == "__main__":
    collector.start()
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
