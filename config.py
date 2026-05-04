# config.py — SRE-grade configuration with SLOs, thresholds, and severity levels

class Config:
    # ── Flask ─────────────────────────────────────────────────
    DEBUG  = False
    HOST   = "0.0.0.0"
    PORT   = 5050

    # ── Collection ────────────────────────────────────────────
    COLLECT_INTERVAL = 2    # seconds between psutil samples
    HISTORY_SECONDS  = 300  # rolling window kept in memory (5 min)

    # ── Severity thresholds (%) ───────────────────────────────
    # Each resource has three levels: INFO → WARNING → CRITICAL
    THRESHOLDS = {
        "cpu": {
            "info":     60,   # P3 — worth watching
            "warning":  80,   # P2 — investigate soon
            "critical": 95,   # P1 — page on-call immediately
        },
        "memory": {
            "info":     70,
            "warning":  85,
            "critical": 95,
        },
        "disk": {
            "info":     70,
            "warning":  85,
            "critical": 95,
        },
    }

    # ── SLO Definitions ───────────────────────────────────────
    # target: % of samples that must be BELOW the threshold
    # window_samples: how many recent samples to evaluate
    SLOS = {
        "cpu_availability": {
            "display":        "CPU Availability SLO",
            "resource":       "cpu",
            "threshold":      80,          # good = cpu < 80%
            "target_pct":     99.0,        # 99% of samples must be good
            "window_samples": 150,         # last 5 min (150 × 2 s)
            "runbook":        "Investigate high-CPU processes. Check for runaway jobs or resource leaks.",
        },
        "memory_availability": {
            "display":        "Memory Availability SLO",
            "resource":       "memory",
            "threshold":      90,
            "target_pct":     99.5,
            "window_samples": 150,
            "runbook":        "Check for memory leaks. Consider restarting services or scaling up RAM.",
        },
        "disk_availability": {
            "display":        "Disk Availability SLO",
            "resource":       "disk",
            "threshold":      85,
            "target_pct":     99.9,
            "window_samples": 150,
            "runbook":        "Clear logs and temp files. Archive old data. Consider expanding storage.",
        },
    }

    # ── Runbooks by resource ──────────────────────────────────
    RUNBOOKS = {
        "cpu": {
            "warning":  "Run `top` to identify the top CPU consumers. Throttle or restart if needed.",
            "critical": "IMMEDIATE: Identify runaway process. Consider kill -9 or auto-restart policy.",
        },
        "memory": {
            "warning":  "Check for memory leaks with `vmstat`. Review swap usage.",
            "critical": "IMMEDIATE: Risk of OOM kill. Restart highest-memory process now.",
        },
        "disk": {
            "warning":  "Run `du -sh /*` to find large directories. Clean up logs.",
            "critical": "IMMEDIATE: Disk full will cause service outage. Delete or archive data NOW.",
        },
    }
