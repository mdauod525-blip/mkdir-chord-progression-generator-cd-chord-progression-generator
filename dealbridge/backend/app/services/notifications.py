"""Email (Resend / SendGrid) and SMS (Twilio) with consent enforcement.

* Email to an investor requires `email_consent` and no unsubscribe; every email carries an
  unsubscribe link, the sender's physical mailing address (CAN-SPAM) and the estimates disclosure.
* SMS requires explicit `sms_consent` (TCPA) and includes STOP instructions.
* Without provider credentials messages are recorded as `dry_run` (nothing is sent).
* Admin notifications (alerts to staff) bypass investor consent but go only to staff users.
"""
from __future__ import annotations

import logging

import httpx
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Interaction, Investor, MessageTemplate, Notification
from .settings_store import get_setting

log = logging.getLogger(__name__)
_env = SandboxedEnvironment(autoescape=False, trim_blocks=True, lstrip_blocks=True)

DEFAULT_TEMPLATES = [
    {
        "key": "new_deal_alert",
        "name": "New deal alert",
        "channel": "email",
        "subject": "New opportunity: {{ opportunity.title }}",
        "body": (
            "Hi {{ investor.name }},\n\n"
            "A new opportunity that fits the preferences you shared is available for review:\n\n"
            "{{ opportunity.title }} — {{ opportunity.location }}\n"
            "Deal score: {{ opportunity.score }} ({{ opportunity.band }})\n"
            "Estimated ARV: {{ opportunity.arv }} | Estimated total project cost: {{ opportunity.total_cost }}\n"
            "Projected net profit: {{ opportunity.net_profit }} | Projected ROI: {{ opportunity.roi }}\n\n"
            "View details: {{ opportunity.url }}\n\n"
            "This is a preliminary match based on your stated preferences, not an offer or a commitment."
        ),
    },
    {
        "key": "investor_introduction",
        "name": "Investor introduction",
        "channel": "email",
        "subject": "Welcome to DealBridge AI",
        "body": (
            "Hi {{ investor.name }},\n\n"
            "Thanks for joining DealBridge AI. Once your profile is reviewed you will be able to see "
            "analyzed opportunities that fit your markets, budget and return targets.\n\n"
            "Update your preferences any time: {{ app_url }}/portal/profile"
        ),
    },
    {
        "key": "follow_up",
        "name": "Follow-up",
        "channel": "email",
        "subject": "Following up{% if opportunity %} on {{ opportunity.title }}{% endif %}",
        "body": (
            "Hi {{ investor.name }},\n\n{{ note or 'Checking in to see if you have questions about current opportunities.' }}\n\n"
            "Reply to this email or schedule a call from your portal."
        ),
    },
    {
        "key": "weekly_report",
        "name": "Weekly opportunity report",
        "channel": "email",
        "subject": "Weekly opportunities — {{ period }}",
        "body": "Hi {{ investor.name }},\n\nHere are this week's published opportunities:\n\n{{ report }}\n",
    },
    {
        "key": "new_deal_sms",
        "name": "New deal SMS",
        "channel": "sms",
        "subject": None,
        "body": "DealBridge: new opportunity in {{ opportunity.location }} (score {{ opportunity.score }}). {{ opportunity.url }} Reply STOP to opt out.",
    },
]


def render(template: str, context: dict) -> str:
    return _env.from_string(template).render(**context)


def _email_footer(inv: Investor | None) -> str:
    s = get_settings()
    lines = ["", "—", ]
    with_disclosure = s.mailing_address
    if inv is not None:
        lines.append(f"Unsubscribe: {s.public_app_url}/unsubscribe/{inv.unsubscribe_token}")
    lines.append(with_disclosure)
    return "\n".join(lines)


def _send_email(to: str, subject: str, body: str) -> tuple[str, str | None, str | None, str]:
    """Returns (status, provider_message_id, error, provider)."""
    s = get_settings()
    try:
        if s.email_provider == "resend" and s.resend_api_key:
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {s.resend_api_key}"},
                json={"from": s.email_from, "to": [to], "subject": subject, "text": body},
                timeout=20,
            )
            r.raise_for_status()
            return "sent", r.json().get("id"), None, "resend"
        if s.email_provider == "sendgrid" and s.sendgrid_api_key:
            r = httpx.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {s.sendgrid_api_key}"},
                json={
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": s.email_from.split("<")[-1].rstrip(">").strip()},
                    "subject": subject,
                    "content": [{"type": "text/plain", "value": body}],
                },
                timeout=20,
            )
            r.raise_for_status()
            return "sent", r.headers.get("X-Message-Id"), None, "sendgrid"
    except httpx.HTTPError as exc:
        return "failed", None, str(exc)[:500], s.email_provider
    log.info("DRY-RUN email to %s: %s", to, subject)
    return "dry_run", None, None, "console"


def _send_sms(to: str, body: str) -> tuple[str, str | None, str | None, str]:
    s = get_settings()
    if s.twilio_account_sid and s.twilio_auth_token and s.twilio_from_number:
        try:
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json",
                auth=(s.twilio_account_sid, s.twilio_auth_token),
                data={"To": to, "From": s.twilio_from_number, "Body": body},
                timeout=20,
            )
            r.raise_for_status()
            return "sent", r.json().get("sid"), None, "twilio"
        except httpx.HTTPError as exc:
            return "failed", None, str(exc)[:500], "twilio"
    log.info("DRY-RUN sms to %s", to)
    return "dry_run", None, None, "console"


def get_template(db: Session, key: str) -> MessageTemplate:
    t = db.query(MessageTemplate).filter_by(key=key).one_or_none()
    if t:
        return t
    d = next((x for x in DEFAULT_TEMPLATES if x["key"] == key), None)
    if not d:
        raise KeyError(key)
    return MessageTemplate(**d)


def notify_investor(
    db: Session,
    inv: Investor,
    template_key: str,
    context: dict,
    channel: str | None = None,
    user_id: str | None = None,
    opportunity_id: str | None = None,
) -> Notification:
    from ..security import decrypt

    s = get_settings()
    t = get_template(db, template_key)
    ch = channel or t.channel
    ctx = {"investor": {"name": inv.name, "entity": inv.entity_name}, "app_url": s.public_app_url, **context}
    subject = render(t.subject or "", ctx) if t.subject else None
    body = render(t.body, ctx)

    status = provider = msg_id = err = None
    recipient = inv.email
    if ch == "email":
        if inv.unsubscribed:
            status = "blocked_unsubscribed"
        elif not inv.email_consent:
            status = "blocked_no_consent"
        else:
            body = body + "\n\n" + str(get_setting(db, "disclosure_text")) + _email_footer(inv)
            status, msg_id, err, provider = _send_email(inv.email, subject or "DealBridge AI", body)
    else:
        recipient = decrypt(inv.phone_enc) or ""
        if not inv.sms_consent or inv.unsubscribed:
            status = "blocked_no_consent"
        elif not recipient:
            status, err = "failed", "no phone number on file"
        else:
            status, msg_id, err, provider = _send_sms(recipient, body)

    n = Notification(channel=ch, recipient=recipient if ch == "email" else "sms:" + recipient[-4:],
                     investor_id=inv.id, template_key=template_key, subject=subject, body=body,
                     status=status, provider=provider, provider_message_id=msg_id, error=err)
    db.add(n)
    if status in ("sent", "dry_run"):
        db.add(Interaction(investor_id=inv.id, kind=ch, direction="outbound", subject=subject,
                           body=body[:4000], opportunity_id=opportunity_id, user_id=user_id))
    return n


def notify_staff(db: Session, emails: list[str], subject: str, body: str) -> list[Notification]:
    out = []
    for e in emails:
        status, msg_id, err, provider = _send_email(e, subject, body)
        n = Notification(channel="email", recipient=e, subject=subject, body=body, status=status,
                         provider=provider, provider_message_id=msg_id, error=err, template_key="staff_alert")
        db.add(n)
        out.append(n)
    return out
