from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from contacts.models import LimiteEnviosIP


ENVIO_MAXIMO_POR_VENTANA = 10
VENTANA_ENVIO = timedelta(hours=1)


@transaction.atomic
def permitir_envio(ip):
    ip_hash = salted_hmac(
        "contacts.public_submission_ip",
        ip or "unknown",
        secret=settings.SECRET_KEY,
    ).hexdigest()
    now = timezone.now()
    record, _ = LimiteEnviosIP.objects.select_for_update().get_or_create(
        ip_hash=ip_hash,
        defaults={"inicio_ventana": now, "cantidad": 0},
    )
    if now - record.inicio_ventana >= VENTANA_ENVIO:
        record.inicio_ventana = now
        record.cantidad = 0
    if record.cantidad >= ENVIO_MAXIMO_POR_VENTANA:
        record.save(update_fields=["inicio_ventana", "cantidad"])
        return False
    record.cantidad += 1
    record.save(update_fields=["inicio_ventana", "cantidad"])
    return True
