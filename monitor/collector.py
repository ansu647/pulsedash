"""
monitor/collector.py
Collects CPU, Memory, Disk, and Network metrics via psutil.
Stores a rolling window of history and fires alerts.
"""

import psutil
import time
import threading
from collections import deque
from config import Config


class MetricsCollector:
    """Background thread that samples system metrics every COLLECT_INTERVAL seconds."""

    def __init__(self):
        max_points = Config.HISTORY_SECONDS // Config.COLLECT_INTERVAL

        self.cpu_history    = deque(maxlen=max_points)
        self.mem_history    = deque(maxlen=max_points)
        self.disk_history   = deque(maxlen=max_points)
        self.net_history    = deque(maxlen=max_points)
        self.alerts         = deque(maxlen=100)

        self._lock          = threading.Lock()
        self._running       = False
        self._thread        = None

        # Baseline for network delta calculation
        self._prev_net      = psutil.net_io_counters()
        self._prev_time     = time.time()

    # ------------------------------------------------------------------
    # Background collection
    # ------------------------------------------------------------------
    def start(self):
        self._running = True
        self._thread  = threading.Thread(target=self._collect_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _collect_loop(self):
        while self._running:
            self._sample()
            time.sleep(Config.COLLECT_INTERVAL)

    def _sample(self):
        ts  = time.time()
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        dsk = psutil.disk_usage("/")
        net = psutil.net_io_counters()

        now       = time.time()
        elapsed   = max(now - self._prev_time, 0.001)
        net_sent  = (net.bytes_sent - self._prev_net.bytes_sent) / elapsed / 1024   # KB/s
        net_recv  = (net.bytes_recv - self._prev_net.bytes_recv) / elapsed / 1024   # KB/s
        self._prev_net  = net
        self._prev_time = now

        point = {
            "ts":         ts,
            "cpu":        round(cpu, 1),
            "mem":        round(mem.percent, 1),
            # Use (total - available) to match psutil's percent formula on macOS
            "mem_used":   round((mem.total - mem.available) / (1024**3), 2),  # GB
            "mem_total":  round(mem.total / (1024**3), 2),  # GB
            "disk":       round(dsk.percent, 1),
            "disk_used":  round(dsk.used / (1024**3), 2),   # GB
            "disk_total": round(dsk.total / (1024**3), 2),  # GB
            "net_sent":   round(net_sent, 2),
            "net_recv":   round(net_recv, 2),
        }

        with self._lock:
            self.cpu_history.append(point)
            self.mem_history.append(point)
            self.disk_history.append(point)
            self.net_history.append(point)
            self._check_alerts(point)

    # ------------------------------------------------------------------
    # Alert checking
    # ------------------------------------------------------------------
    def _check_alerts(self, p):
        checks = [
            ("CPU",    p["cpu"],  Config.CPU_THRESHOLD),
            ("Memory", p["mem"],  Config.MEMORY_THRESHOLD),
            ("Disk",   p["disk"], Config.DISK_THRESHOLD),
        ]
        for name, value, threshold in checks:
            if value > threshold:
                self.alerts.appendleft({
                    "ts":        p["ts"],
                    "resource":  name,
                    "value":     value,
                    "threshold": threshold,
                    "message":   f"⚠️  {name} usage at {value}% — exceeds {threshold}% threshold",
                })

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def current_snapshot(self):
        """Return the latest single data point."""
        with self._lock:
            history = list(self.cpu_history)
        return history[-1] if history else {}

    def history(self, limit=150):
        """Return the last `limit` data points."""
        with self._lock:
            data = list(self.cpu_history)
        return data[-limit:]

    def recent_alerts(self, limit=20):
        with self._lock:
            return list(self.alerts)[:limit]

    def process_list(self, top_n=10):
        """Return top N processes by CPU usage."""
        procs = []
        for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status"]):
            try:
                info = p.info
                procs.append({
                    "pid":    info["pid"],
                    "name":   info["name"],
                    "cpu":    round(info["cpu_percent"] or 0, 1),
                    "mem":    round(info["memory_percent"] or 0, 2),
                    "status": info["status"],
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x["cpu"], reverse=True)
        return procs[:top_n]
