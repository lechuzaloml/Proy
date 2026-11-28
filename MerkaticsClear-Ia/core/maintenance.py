from django.contrib.sessions.models import Session
from django.utils import timezone

from contacts.models import LimiteEnviosIP
from contacts.services import VENTANA_ENVIO
from users.models import IntentoAcceso
from users.views import LOGIN_WINDOW


def limpiar_datos_temporales():
    now = timezone.now()
    sessions_deleted, _ = Session.objects.filter(expire_date__lt=now).delete()
    login_attempts_deleted, _ = IntentoAcceso.objects.filter(
        inicio_ventana__lt=now - LOGIN_WINDOW
    ).delete()
    submission_limits_deleted, _ = LimiteEnviosIP.objects.filter(
        inicio_ventana__lt=now - VENTANA_ENVIO
    ).delete()
    return {
        "sesiones": sessions_deleted,
        "intentos_acceso": login_attempts_deleted,
        "limites_envio": submission_limits_deleted,
    }
