"""Scheduler process: `python -m app.worker` (set DEALBRIDGE_SCHEDULER_ENABLED=true)."""
from .agent.scheduler import start
from .config import get_settings

if __name__ == "__main__":
    if not get_settings().scheduler_enabled:
        raise SystemExit("DEALBRIDGE_SCHEDULER_ENABLED is false — refusing to start the scheduler")
    start()
