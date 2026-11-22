from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AdminAlert, AuditLog


def audit(
    db: Session,
    action: str,
    user_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            action=action,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=ip,
        )
    )


def alert(db: Session, category: str, title: str, body: str | None = None, level: str = "info",
          entity_id: str | None = None) -> AdminAlert:
    a = AdminAlert(category=category, title=title, body=body, level=level, entity_id=entity_id)
    db.add(a)
    return a
