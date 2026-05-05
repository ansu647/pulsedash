"""
monitor/anomaly.py
Statistical anomaly detection using Z-score over a rolling window.
Flags metric values that deviate significantly from the recent mean —
a lightweight SRE observability primitive before wiring in a full ML pipeline.
"""

import math
import time
from collections import deque


class AnomalyDetector:
    """
    Per-resource Z-score detector.
    A sample is anomalous when |z| >= threshold (default 2.5 sigma).
    """

    def __init__(self, window: int = 60, z_threshold: float = 2.5):
        """
        Args:
            window:      Number of recent samples used to compute mean/stddev.
            z_threshold: Minimum |z| to classify as an anomaly.
        """
        self._window      = window
        self._z_threshold = z_threshold
        # resource → rolling deque of float values
        self._samples: dict[str, deque] = {}
        # recent anomaly events (newest first)
        self._anomalies: deque = deque(maxlen=100)

    # ── Public API ─────────────────────────────────────────────

    def record(self, resource: str, value: float) -> dict | None:
        """
        Feed a new sample for the given resource.
        Returns an anomaly dict if the sample is anomalous, else None.
        """
        if resource not in self._samples:
            self._samples[resource] = deque(maxlen=self._window)

        buf = self._samples[resource]

        # Need at least 10 samples to get a meaningful stddev
        if len(buf) >= 10:
            mean, std = self._stats(buf)
            if std > 0:
                z = (value - mean) / std
                if abs(z) >= self._z_threshold:
                    event = {
                        "ts":       time.time(),
                        "resource": resource,
                        "value":    round(value, 2),
                        "mean":     round(mean, 2),
                        "std":      round(std, 2),
                        "z_score":  round(z, 2),
                        "direction": "HIGH" if z > 0 else "LOW",
                    }
                    self._anomalies.appendleft(event)
                    buf.append(value)
                    return event

        buf.append(value)
        return None

    def recent_anomalies(self, limit: int = 20) -> list:
        return list(self._anomalies)[:limit]

    def summary(self) -> dict:
        """Returns per-resource mean/std/sample-count for the current window."""
        out = {}
        for resource, buf in self._samples.items():
            if len(buf) < 2:
                out[resource] = {"samples": len(buf), "mean": None, "std": None}
                continue
            mean, std = self._stats(buf)
            out[resource] = {
                "samples": len(buf),
                "mean":    round(mean, 2),
                "std":     round(std, 2),
            }
        return out

    # ── Internal ───────────────────────────────────────────────

    @staticmethod
    def _stats(buf: deque) -> tuple[float, float]:
        n    = len(buf)
        mean = sum(buf) / n
        var  = sum((x - mean) ** 2 for x in buf) / n
        return mean, math.sqrt(var)
