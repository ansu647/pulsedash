"""
monitor/collector.py  (SRE-enhanced)
Collects metrics via psutil, classifies severity, feeds SLO tracker,
triggers incident manager, and emits structured logs.
"""

import psutil
import time
import threading
from collections import deque
from config import Config
from monitor.logger import logger
from monitor.slo import SLOTracker
from monitor.incident import IncidentManager


def _severity(resource: str, value: float) -> str:
    t = Config.THRESHOLDS.get(resource, {})
    if value >= t.get("critical", 101):
        return "CRITICAL"
    if value >= t.get("warning", 101):
        return "WARNING"
    if value >= t.get("info", 101):
        return "INFO"
    return "OK"


class MetricsCollector:
    """Background thread sampling system metrics every COLLECT_INTERVAL seconds."""

    def __init__(self):
        max_pts = Config.HISTORY_SECONDS // Config.COLLECT_INTERVAL

        self.history  = deque(maxlen=max_pts)
        self.alerts   = deque(maxlen=200)

        self._lock    = threading.Lock()
        self._running = False
        self._thread  = None

        self._prev_net  = psutil.net_io_counters()
        self._prev_time = time.time()

        self.slo_tracker      = SLOTracker()
        self.incident_manager = IncidentManager()

        # Uptime
        self._start_time = time.time()

    # ── Lifecycle ─────────────────────────────────────────────

    def start(self):
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("MetricsCollector started", interval_s=Config.COLLECT_INTERVAL)

    def stop(self):
        self._running = False
        logger.info("MetricsCollector stopped")

    def _loop(self):
        while self._running:
            try:
                self._sample()
            except Exception as e:
                logger.error("Sample error", error=str(e))
            time.sleep(Config.COLLECT_INTERVAL)

    # ── Sampling ──────────────────────────────────────────────

    def _sample(self):
        ts  = time.time()
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        dsk = psutil.disk_usage("/")
        net = psutil.net_io_counters()

        now     = time.time()
        elapsed = max(now - self._prev_time, 0.001)
        net_sent = (net.bytes_sent - self._prev_net.bytes_sent) / elapsed / 1024
        net_recv = (net.bytes_recv - self._prev_net.bytes_recv) / elapsed / 1024
        self._prev_net  = net
        self._prev_time = now

        mem_pct    = round(mem.percent, 1)
        mem_used   = round((mem.total - mem.available) / (1024**3), 2)
        mem_total  = round(mem.total / (1024**3), 2)
        disk_pct   = round(dsk.percent, 1)
        cpu_pct    = round(cpu, 1)

        cpu_sev  = _severity("cpu",    cpu_pct)
        mem_sev  = _severity("memory", mem_pct)
        disk_sev = _severity("disk",   disk_pct)

        point = {
            "ts":         ts,
            "cpu":        cpu_pct,
            "cpu_sev":    cpu_sev,
            "mem":        mem_pct,
            "mem_sev":    mem_sev,
            "mem_used":   mem_used,
            "mem_total":  mem_total,
            "disk":       disk_pct,
            "disk_sev":   disk_sev,
            "disk_used":  round(dsk.used / (1024**3), 2),
            "disk_total": round(dsk.total / (1024**3), 2),
            "net_sent":   round(net_sent, 2),
            "net_recv":   round(net_recv, 2),
        }

        # SLO tracking
        self.slo_tracker.record(cpu_pct, mem_pct, disk_pct)

        # Incident management (critical threshold only)
        t = Config.THRESHOLDS
        self.incident_manager.evaluate("cpu",    cpu_pct,  t["cpu"]["critical"])
        self.incident_manager.evaluate("memory", mem_pct,  t["memory"]["critical"])
        self.incident_manager.evaluate("disk",   disk_pct, t["disk"]["critical"])

        # Alerts for WARNING+
        with self._lock:
            self.history.append(point)
            self._check_alerts(point)

    def _check_alerts(self, p):
        checks = [
            ("CPU",    p["cpu"],  p["cpu_sev"],  Config.THRESHOLDS["cpu"]),
            ("Memory", p["mem"],  p["mem_sev"],  Config.THRESHOLDS["memory"]),
            ("Disk",   p["disk"], p["disk_sev"], Config.THRESHOLDS["disk"]),
        ]
        for name, value, sev, thr in checks:
            if sev in ("WARNING", "CRITICAL"):
                runbook_key = name.lower()
                runbook = Config.RUNBOOKS.get(runbook_key, {}).get(sev.lower(), "")
                self.alerts.appendleft({
                    "ts":        p["ts"],
                    "resource":  name,
                    "value":     value,
                    "severity":  sev,
                    "threshold": thr[sev.lower()],
                    "message":   f"{name} at {value}% — {sev}",
                    "runbook":   runbook,
                })

    # ── Public API ────────────────────────────────────────────

    def current_snapshot(self):
        with self._lock:
            h = list(self.history)
        return h[-1] if h else {}

    def history_data(self, limit=150):
        with self._lock:
            return list(self.history)[-limit:]

    def recent_alerts(self, limit=30):
        with self._lock:
            return list(self.alerts)[:limit]

    def slo_report(self):
        return self.slo_tracker.report()

    def incidents(self, limit=20):
        return self.incident_manager.all_incidents(limit)

    def active_incidents(self):
        return self.incident_manager.active_incidents()

    def health_score(self) -> int:
        """
        Composite 0–100 health score.
        Deduct points for WARNING/CRITICAL metrics and open incidents.
        """
        snap = self.current_snapshot()
        if not snap:
            return 100
        score = 100
        for resource, sev_key in [("cpu","cpu_sev"),("mem","mem_sev"),("disk","disk_sev")]:
            sev = snap.get(sev_key, "OK")
            if sev == "WARNING":  score -= 10
            if sev == "CRITICAL": score -= 25
        score -= len(self.active_incidents()) * 5
        return max(0, score)

    def uptime_seconds(self) -> float:
        return round(time.time() - self._start_time, 0)

    def process_list(self, top_n=10):
        procs = []
        for p in psutil.process_iter(["pid","name","cpu_percent","memory_percent","status"]):
            try:
                i = p.info
                procs.append({
                    "pid":    i["pid"],
                    "name":   i["name"],
                    "cpu":    round(i["cpu_percent"] or 0, 1),
                    "mem":    round(i["memory_percent"] or 0, 2),
                    "status": i["status"],
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x["cpu"], reverse=True)
        return procs[:top_n]

    def prometheus_metrics(self) -> str:
        """Expose metrics in Prometheus text format for /metrics endpoint."""
        snap = self.current_snapshot()
        if not snap:
            return ""
        lines = [
            "# HELP pulsedash_cpu_percent Current CPU usage percentage",
            "# TYPE pulsedash_cpu_percent gauge",
            f'pulsedash_cpu_percent {snap.get("cpu", 0)}',
            "# HELP pulsedash_memory_percent Current memory usage percentage",
            "# TYPE pulsedash_memory_percent gauge",
            f'pulsedash_memory_percent {snap.get("mem", 0)}',
            "# HELP pulsedash_disk_percent Current disk usage percentage",
            "# TYPE pulsedash_disk_percent gauge",
            f'pulsedash_disk_percent {snap.get("disk", 0)}',
            "# HELP pulsedash_network_sent_kbps Network bytes sent KB/s",
            "# TYPE pulsedash_network_sent_kbps gauge",
            f'pulsedash_network_sent_kbps {snap.get("net_sent", 0)}',
            "# HELP pulsedash_network_recv_kbps Network bytes received KB/s",
            "# TYPE pulsedash_network_recv_kbps gauge",
            f'pulsedash_network_recv_kbps {snap.get("net_recv", 0)}',
            "# HELP pulsedash_health_score Composite system health score 0-100",
            "# TYPE pulsedash_health_score gauge",
            f'pulsedash_health_score {self.health_score()}',
            "# HELP pulsedash_active_incidents Number of active incidents",
            "# TYPE pulsedash_active_incidents gauge",
            f'pulsedash_active_incidents {len(self.active_incidents())}',
            "# HELP pulsedash_uptime_seconds Collector uptime in seconds",
            "# TYPE pulsedash_uptime_seconds counter",
            f'pulsedash_uptime_seconds {self.uptime_seconds()}',
        ]
        # SLO compliance per SLO
        for key, slo in self.slo_report().items():
            if "compliance_pct" in slo:
                lines += [
                    f"# HELP pulsedash_slo_{key}_compliance SLO compliance percentage",
                    f"# TYPE pulsedash_slo_{key}_compliance gauge",
                    f'pulsedash_slo_{key}_compliance {slo["compliance_pct"]}',
                    f"# HELP pulsedash_slo_{key}_error_budget_remaining Error budget remaining %",
                    f"# TYPE pulsedash_slo_{key}_error_budget_remaining gauge",
                    f'pulsedash_slo_{key}_error_budget_remaining {slo["error_budget_rem"]}',
                ]
        return "\n".join(lines) + "\n"
