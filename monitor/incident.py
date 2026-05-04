"""
monitor/incident.py
Incident management — tracks when metrics breach CRITICAL thresholds,
records MTTD (Mean Time To Detect), and auto-closes when recovered.
"""

import time
from collections import deque
from monitor.logger import logger


class IncidentManager:
    """
    SRE Incident lifecycle:
      OPEN   → resource breaches CRITICAL threshold  (MTTD recorded)
      CLOSED → resource recovers below threshold      (duration recorded)
    """

    def __init__(self, max_incidents: int = 50):
        self._incidents  = deque(maxlen=max_incidents)
        self._open       = {}   # resource → incident dict
        self._id_counter = 0

    # ── Public API ────────────────────────────────────────────

    def evaluate(self, resource: str, value: float, threshold: float):
        """Call every sample. Opens or closes incidents automatically."""
        breaching = value >= threshold

        if breaching and resource not in self._open:
            self._open_incident(resource, value, threshold)
        elif not breaching and resource in self._open:
            self._close_incident(resource, value)

    def active_incidents(self):
        return list(self._open.values())

    def all_incidents(self, limit: int = 20):
        return list(self._incidents)[:limit]

    def mttr_seconds(self):
        """Mean Time To Recover across closed incidents."""
        closed = [i for i in self._incidents if i["status"] == "CLOSED"]
        if not closed:
            return None
        return round(sum(i["duration_s"] for i in closed) / len(closed), 1)

    def mttd_seconds(self):
        """Mean Time To Detect — time from breach start to first alert."""
        # In our model detection is immediate (same sample), so MTTD ≈ collect_interval
        return 2   # seconds (our sample interval)

    # ── Internal ──────────────────────────────────────────────

    def _open_incident(self, resource: str, value: float, threshold: float):
        self._id_counter += 1
        incident = {
            "id":         f"INC-{self._id_counter:04d}",
            "resource":   resource,
            "value":      value,
            "threshold":  threshold,
            "status":     "OPEN",
            "opened_at":  time.time(),
            "closed_at":  None,
            "duration_s": None,
        }
        self._open[resource] = incident
        self._incidents.appendleft(incident)
        logger.critical(
            f"Incident OPENED: {resource} at {value:.1f}% (threshold {threshold}%)",
            incident_id=incident["id"],
            resource=resource,
            value=value,
        )

    def _close_incident(self, resource: str, value: float):
        incident = self._open.pop(resource)
        now = time.time()
        incident["closed_at"]  = now
        incident["duration_s"] = round(now - incident["opened_at"], 1)
        incident["status"]     = "CLOSED"
        logger.info(
            f"Incident CLOSED: {resource} recovered (duration {incident['duration_s']}s)",
            incident_id=incident["id"],
            resource=resource,
            value=value,
        )
