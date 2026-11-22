"""Background scheduler (APScheduler, free). Run as its own process: `python -m app.worker`.

On free hosting without an always-on worker, the same workflows can be triggered by a
GitHub Actions cron calling `python -m app.cli daily` (see .github/workflows/dealbridge-agent.yml)
or by an admin from the dashboard.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..db import SessionLocal
from ..services.settings_store import get_setting
from .workflows import run_daily, run_weekly

log = logging.getLogger(__name__)


def _job(name: str) -> None:
    db = SessionLocal()
    try:
        if not get_setting(db, f"agent_{name}_enabled"):
            log.info("%s workflow disabled in settings", name)
            return
        run = (run_daily if name == "daily" else run_weekly)(db, triggered_by="scheduler")
        db.commit()
        log.info("%s workflow finished: %s %s", name, run.status, run.stats)
    except Exception:
        db.rollback()
        log.exception("%s workflow crashed", name)
    finally:
        db.close()


def start() -> None:
    s = get_settings()
    sched = BlockingScheduler(timezone=s.timezone)
    sched.add_job(_job, CronTrigger.from_crontab(s.daily_cron, timezone=s.timezone), args=["daily"],
                  id="daily", max_instances=1, coalesce=True)
    sched.add_job(_job, CronTrigger.from_crontab(s.weekly_cron, timezone=s.timezone), args=["weekly"],
                  id="weekly", max_instances=1, coalesce=True)
    log.info("scheduler started: daily=%s weekly=%s (%s)", s.daily_cron, s.weekly_cron, s.timezone)
    sched.start()
