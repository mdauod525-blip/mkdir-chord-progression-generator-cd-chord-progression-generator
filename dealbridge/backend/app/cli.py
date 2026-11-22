"""Command line: `python -m app.cli <command>`.

  init-db                          create tables (dev/test; production uses `alembic upgrade head`)
  seed                             reference data: markets, data-source catalog, pricing tiers
  seed-demo                        clearly-labelled DEMO properties, comps and investors (+ demo logins)
  create-admin EMAIL PASSWORD      create an admin user
  daily | weekly                   run an agent workflow once (e.g. from a GitHub Actions cron)
  analyze-all                      analyze every active property
"""
from __future__ import annotations

import sys

from .db import SessionLocal, init_db


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    if cmd == "init-db":
        init_db()
        print("tables created")
        return 0
    db = SessionLocal()
    try:
        if cmd == "seed":
            from .seed import seed_reference

            seed_reference(db)
            print("reference data seeded")
        elif cmd == "seed-demo":
            from .seed import create_user, seed_demo, seed_reference

            seed_reference(db)
            out = seed_demo(db)
            create_user(db, "admin@example.com", "DemoAdmin-2026!", "admin", "Demo Admin")
            from .agent.workflows import run_daily

            run = run_daily(db, triggered_by="seed-demo")
            print(f"demo data seeded: {out}; daily workflow: {run.status} {run.stats}")
            print("DEMO logins — admin@example.com / DemoAdmin-2026!  investor.demo@example.com / DemoInvestor-2026!")
            print("Change or remove these accounts before any real use.")
        elif cmd == "create-admin":
            if len(args) != 2 or len(args[1]) < 12:
                print("usage: create-admin EMAIL PASSWORD (password ≥ 12 chars)")
                return 1
            from .seed import create_user

            create_user(db, args[0], args[1], "admin")
            print(f"admin {args[0]} ready")
        elif cmd in ("daily", "weekly"):
            from .agent.workflows import run_daily, run_weekly

            run = (run_daily if cmd == "daily" else run_weekly)(db, triggered_by="cli")
            print(f"{cmd}: {run.status} {run.stats}")
        elif cmd == "analyze-all":
            from sqlalchemy import select

            from .analysis.pipeline import analyze_property
            from .matching.service import match_property
            from .models import Property

            n = 0
            for p in db.scalars(select(Property).where(Property.status.notin_(["rejected", "archived"]))):
                a, _ = analyze_property(db, p, actor="cli")
                match_property(db, p, a)
                n += 1
            print(f"analyzed {n} properties")
        else:
            print(__doc__)
            return 1
        db.commit()
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
