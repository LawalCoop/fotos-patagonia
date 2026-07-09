import html as html_lib

from fastapi import APIRouter
from pydantic import BaseModel

from core.config import settings
from services.email_service import send_email

router = APIRouter(prefix="/contact", tags=["contact"])


class ContactRequest(BaseModel):
    fullName: str
    email: str
    message: str
    phone: str | None = None
    contactType: str | None = None
    location: str | None = None
    date: str | None = None
    eventType: str | None = None
    eventDate: str | None = None
    estimatedPeople: str | None = None


def _row(label: str, value: str | None) -> str:
    safe = html_lib.escape(value) if value else "-"
    return (
        "<tr>"
        f"<td style=\"padding:4px 14px 4px 0;color:#5b6b74\"><strong>{label}</strong></td>"
        f"<td style=\"padding:4px 0\">{safe}</td>"
        "</tr>"
    )


@router.post("/")
def submit_contact(data: ContactRequest):
    rows = "".join(
        [
            _row("Nombre", data.fullName),
            _row("Email", data.email),
            _row("Teléfono", data.phone),
            _row("Tipo de contacto", data.contactType),
            _row("Lugar", data.location),
            _row("Fecha", data.date),
            _row("Tipo de evento", data.eventType),
            _row("Fecha del evento", data.eventDate),
            _row("Personas estimadas", data.estimatedPeople),
        ]
    )
    message_html = html_lib.escape(data.message).replace("\n", "<br>")
    html = (
        "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#1f2d3a\">"
        "<h2 style=\"color:#0d5c72;margin:0 0 12px\">Nuevo contacto desde la web</h2>"
        f"<table style=\"border-collapse:collapse\">{rows}</table>"
        "<p style=\"margin:16px 0 4px\"><strong>Mensaje:</strong></p>"
        f"<p style=\"white-space:pre-wrap;margin:0\">{message_html}</p>"
        "</div>"
    )
    # Reusa el mismo servicio Resend que los mails de pedidos.
    send_email(
        to_email=settings.CONTACT_EMAIL,
        subject=f"Contacto web: {data.fullName}",
        body=html,
        html=True,
    )
    return {"ok": True}
