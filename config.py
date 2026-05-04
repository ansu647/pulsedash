# config.py — Alert thresholds and app configuration

class Config:
    # Alert thresholds (%)
    CPU_THRESHOLD    = 80
    MEMORY_THRESHOLD = 90   # macOS fills RAM aggressively (caches, wired); 90% is safer
    DISK_THRESHOLD   = 90

    # How many seconds of history to keep in memory
    HISTORY_SECONDS  = 300   # 5 minutes

    # Metrics collection interval (seconds)
    COLLECT_INTERVAL = 2

    # Flask
    DEBUG = False
    HOST  = "0.0.0.0"
    PORT  = 5050
