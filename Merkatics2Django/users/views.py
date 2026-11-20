import hashlib
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.db import transaction
from django.http import HttpResponseNotAllowed
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

from users.forms import AccesoGoogleForm
from users.google_identity import GoogleCredentialError, verify_google_credential
from users.models import IntentoAcceso, Usuario
from workspaces.models import Membresia


LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_LIMIT = 10
https_url_validator = URLValidator(schemes=["https"])


def _client_ip(request):
    return request.META.get("REMOTE_ADDR", "unknown")


def _allow_login_attempt(ip_address):
    ip_hash = hashlib.sha256(ip_address.encode("utf-8")).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        attempt, created = IntentoAcceso.objects.select_for_update().get_or_create(
            ip_hash=ip_hash,
            defaults={"inicio_ventana": now, "cantidad": 0},
        )
        if now - attempt.inicio_ventana >= LOGIN_WINDOW:
            attempt.inicio_ventana = now
            attempt.cantidad = 0
        if attempt.cantidad >= LOGIN_LIMIT:
            if not created:
                attempt.save(update_fields=["inicio_ventana", "cantidad"])
            return False
        attempt.cantidad += 1
        attempt.save(update_fields=["inicio_ventana", "cantidad"])
        return True


def _safe_next(request, target):
    if target and url_has_allowed_host_and_scheme(
        target,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return target
    return "/workspaces/"


def acceso(request):
    if request.method == "GET":
        if request.usuario:
            return redirect("/workspaces/")
        form = AccesoGoogleForm(
            initial={"next": _safe_next(request, request.GET.get("next"))}
        )
        return render(
            request,
            "users/acceso.html",
            {"form": form, "google_client_id": settings.GOOGLE_CLIENT_ID},
        )
    if request.method != "POST":
        return HttpResponseNotAllowed(["GET", "POST"])

    if not _allow_login_attempt(_client_ip(request)):
        return render(
            request,
            "users/acceso.html",
            {
                "form": AccesoGoogleForm(request.POST),
                "google_client_id": settings.GOOGLE_CLIENT_ID,
                "error": "Se alcanzó el límite de intentos. Prueba de nuevo en 15 minutos.",
            },
            status=429,
        )

    form = AccesoGoogleForm(request.POST)
    if not form.is_valid():
        return render(
            request,
            "users/acceso.html",
            {
                "form": form,
                "google_client_id": settings.GOOGLE_CLIENT_ID,
                "error": "No se pudo procesar la solicitud de acceso.",
            },
            status=400,
        )
    try:
        claims = verify_google_credential(form.cleaned_data["credential"])
        if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise GoogleCredentialError("La audiencia de Google no es válida.")
        if claims.get("email_verified") is not True:
            raise GoogleCredentialError("El correo de Google no está verificado.")
        email = claims["email"].strip().lower()
        if len(email) > 191:
            raise ValidationError("El correo de Google supera el máximo permitido.")
        validate_email(email)
    except (GoogleCredentialError, ValidationError, KeyError) as exc:
        return render(
            request,
            "users/acceso.html",
            {
                "form": form,
                "google_client_id": settings.GOOGLE_CLIENT_ID,
                "error": str(exc) or "No se pudo verificar la cuenta de Google.",
            },
            status=400,
        )

    picture = claims.get("picture", "")
    if not isinstance(picture, str):
        picture = ""
    try:
        if picture:
            https_url_validator(picture)
    except ValidationError:
        picture = ""
    name = claims.get("name", "")
    if not isinstance(name, str):
        name = ""

    with transaction.atomic():
        usuario, created = Usuario.objects.get_or_create(
            correo=email,
            defaults={
                "nombre": name[:150],
                "foto_url": picture,
            },
        )
        if not usuario.activo:
            return render(
                request,
                "users/acceso.html",
                {
                    "form": form,
                    "google_client_id": settings.GOOGLE_CLIENT_ID,
                    "error": "Esta cuenta está desactivada. Contacta al administrador.",
                },
                status=403,
            )
        if not created:
            usuario.nombre = name[:150]
            usuario.foto_url = picture
            usuario.ultimo_acceso = timezone.now()
            usuario.save(update_fields=["nombre", "foto_url", "ultimo_acceso"])
        else:
            usuario.ultimo_acceso = timezone.now()
            usuario.save(update_fields=["ultimo_acceso"])
        Membresia.objects.sin_alcance().filter(
            correo=email, usuario__isnull=True
        ).update(usuario=usuario, actualizado=timezone.now())

    request.session.cycle_key()
    request.session.clear()
    request.session["usuario_uid"] = str(usuario.uid)
    return redirect(_safe_next(request, form.cleaned_data["next"]))


def cerrar_sesion(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    request.session.flush()
    return redirect("/acceso/")
