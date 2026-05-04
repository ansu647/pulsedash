"""
monitor/slo.py
SLO (Service Level Objective) tracking engine.
Computes SLI compliance, error budget remaining, and burn rate
over a rolling sample window.
"""

import time
from collections import deque
from config import Config
from monitor.logger import logger


class SLOTracker:
    """
    For each defined SLO, maintains a rolling deque of bool (good/bad) samples
    and computes:
      • compliance_pct  — % of samples that were "good"
      • error_budget_pct — % of error budget remaining (0–100)
      • burn_rate        — how fast budget is consumed vs steady state
      • status           — OK / AT_RISK / BREACHED
    """

    def __init__(self):
        self._windows: dict[str, deque] = {}
        for key, slo in Config.SLOS.items():
            self._windows[key] = deque(maxlen=slo["window_samples"])

    def record(self, cpu: float, memory: float, disk: float):
        """Called every sample with current metric values."""
        values = {"cpu": cpu, "memory": memory, "disk": disk}
        for key, slo in Config.SLOS.items():
            resource_val = values[slo["resource"]]
            good = resource_val < slo["threshold"]
            self._windows[key].append(good)

    def report(self) -> dict:
        """Returns full SLO status for all defined objectives."""
        result = {}
        for key, slo in Config.SLOS.items():
            window = list(self._windows[key])
            if not window:
                result[key] = {"status": "INITIALIZING"}
                continue

            total        = len(window)
            good         = sum(window)
            compliance   = (good / total) * 100
            target       = slo["target_pct"]
            error_budget = (1 - target / 100)           # allowed fraction of bad samples
            actual_bad   = (total - good) / total       # actual fraction of bad samples

            # Error budget remaining (can go negative = breached)
            budget_used     = actual_bad / error_budget if error_budget > 0 else 0
            budget_remain   = max(0.0, round((1 - budget_used) * 100, 1))

            # Burn rate: >1 means budget depleting faster than sustainable
            burn_rate = round(budget_used, 2)

            if compliance >= target:
                status = "OK"
            elif compliance >= target - 1.0:
                status = "AT_RISK"
            else:
                status = "BREACHED"

            result[key] = {
                "display":         slo["display"],
                "resource":        slo["resource"],
                "target_pct":      target,
                "compliance_pct":  round(compliance, 3),
                "error_budget_rem": budget_remain,
                "burn_rate":       burn_rate,
                "status":          status,
                "samples_total":   total,
                "samples_good":    good,
                "runbook":         slo["runbook"],
            }

            if status == "BREACHED":
                logger.warning(
                    f"SLO BREACHED: {slo['display']} at {compliance:.2f}% (target {target}%)",
                    slo_key=key, compliance=compliance, burn_rate=burn_rate,
                )

        return result
