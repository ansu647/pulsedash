"""
monitor/logger.py
Structured JSON logging — Pillar 3 of observability (Logs).
All app events are emitted as JSON for easy ingestion by log aggregators.
"""

import json
import time
import sys
import logging


class StructuredLogger:
    """Emits JSON log lines to stdout."""

    LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}

    def __init__(self, name: str = "pulsedash", min_level: str = "INFO"):
        self.name      = name
        self.min_level = self.LEVELS.get(min_level.upper(), 20)

    def _emit(self, level: str, message: str, **kwargs):
        if self.LEVELS.get(level, 0) < self.min_level:
            return
        record = {
            "ts":      time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "level":   level,
            "service": self.name,
            "msg":     message,
            **kwargs,
        }
        print(json.dumps(record), file=sys.stdout, flush=True)

    def debug(self, msg, **kw):    self._emit("DEBUG",    msg, **kw)
    def info(self, msg, **kw):     self._emit("INFO",     msg, **kw)
    def warning(self, msg, **kw):  self._emit("WARNING",  msg, **kw)
    def error(self, msg, **kw):    self._emit("ERROR",    msg, **kw)
    def critical(self, msg, **kw): self._emit("CRITICAL", msg, **kw)


# Singleton — import this everywhere
logger = StructuredLogger("pulsedash")
