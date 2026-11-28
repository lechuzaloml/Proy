import logging
from datetime import datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal
from urllib.parse import quote

import stripe
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from core.workspace_access import usuario_requerido
from subscriptions.forms import AltaSuscripcionForm
from subscriptions.models import EventoStripe, PruebaUsada, SuscripcionWorkspace
from subscriptions.planes import (
    ETIQUETA_MODO_PRUEBA,
    PLANES_SUSCRIPCION,
    plan_por_id,
)
from subscriptions.recomendaciones import BENEFICIOS, NOTA_PRECIO, planes_recomendados
from users.models import Usuario
from workspaces.models import (
    Membresia,
    Workspace,
    WorkspaceEliminacion,
    validate_workspace_slug,
)


logger = logging.getLogger(__name__)
DIAS_PRUEBA = 7


class CheckoutConflict(Exception):
    pass


def _stripe_client():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _safe_subscription_login(request):
    target = request.get_full_path()
    if not url_has_allowed_host_and_scheme(
        target,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        target = reverse("suscripcion")
    return redirect(f"{reverse('acceso')}?next={quote(target, safe='')}")


def planes(request):
    plan_id = request.GET.get("plan", "")
    recomendado = plan_por_id(plan_id)
    return render(
        request,
        "subscriptions/planes.html",
        {
            "planes": planes_recomendados(),
            "plan_recomendado": recomendado,
            "beneficios": BENEFICIOS,
            "nota_precio": NOTA_PRECIO,
        },
    )


def suscripcion(request):
    if request.usuario is None:
        return _safe_subscription_login(request)

    plan_query = request.GET.get("plan", "")
    query_valido = plan_por_id(plan_query) is not None
    plan_inicial = plan_query if query_valido else "pro"
    mostrar_selector = not query_valido or request.GET.get("cambiar") == "1"
    preparando = request.GET.get("checkout") == "success"
    slug_retorno = request.GET.get("slug", "")
    if preparando:
        try:
            validate_workspace_slug(slug_retorno)
        except ValidationError:
            raise Http404
        return render(
            request,
            "subscriptions/suscripcion.html",
            {
                "preparando": True,
                "slug_retorno": slug_retorno,
                "estado_url": reverse("estado_preparacion_suscripcion"),
                "modo_prueba": ETIQUETA_MODO_PRUEBA,
            },
        )

    if request.method not in {"GET", "POST"}:
        return HttpResponse(status=405)
    error_checkout = ""
    form = AltaSuscripcionForm(
        request.POST if request.method == "POST" else None,
        correo=request.usuario.correo,
        initial={"plan_id": plan_inicial},
    )
    if request.method == "POST":
        mostrar_selector = "mostrar_selector" in request.POST
        if form.is_valid():
            plan = plan_por_id(form.cleaned_data["plan_id"])
            if plan is None:
                form.add_error("plan_id", "Elige un plan disponible.")
                mostrar_selector = True
            else:
                metadata = {
                    "slug": form.cleaned_data["slug"],
                    "nombre": form.cleaned_data["nombre"],
                    "plan": plan["id"],
                    "correo": request.usuario.correo.strip().lower(),
                }
                success_url = (
                    request.build_absolute_uri(reverse("suscripcion"))
                    + "?checkout=success&slug="
                    + quote(metadata["slug"], safe="")
                    + "&session_id={CHECKOUT_SESSION_ID}"
                )
                cancel_url = (
                    request.build_absolute_uri(reverse("suscripcion"))
                    + "?checkout=cancelled&plan="
                    + quote(plan["id"], safe="")
                )
                try:
                    session = _stripe_client().checkout.Session.create(
                        mode="subscription",
                        line_items=[
                            {
                                "price": settings.STRIPE_PRICE_IDS[plan["id"]],
                                "quantity": 1,
                            }
                        ],
                        customer_email=metadata["correo"],
                        client_reference_id=metadata["slug"],
                        metadata=metadata,
                        subscription_data={
                            "trial_period_days": DIAS_PRUEBA,
                            "metadata": metadata,
                        },
                        success_url=success_url,
                        cancel_url=cancel_url,
                    )
                except stripe.StripeError:
                    logger.exception(
                        "No se pudo crear Checkout para el usuario %s.",
                        request.usuario.uid,
                    )
                    error_checkout = (
                        "No se pudo conectar con Stripe. Intenta de nuevo más tarde."
                    )
                else:
                    if not session.url:
                        logger.error(
                            "Stripe Checkout no devolvió URL; sesión %s.",
                            session.id,
                        )
                        error_checkout = (
                            "Stripe no devolvió una dirección de pago. Intenta de nuevo."
                        )
                    else:
                        return redirect(session.url)
    return render(
        request,
        "subscriptions/suscripcion.html",
        {
            "form": form,
            "planes": PLANES_SUSCRIPCION,
            "plan_seleccionado": (
                form.data.get("plan_id", plan_inicial)
                if request.method == "POST"
                else plan_inicial
            ),
            "mostrar_selector": mostrar_selector,
            "modo_prueba": ETIQUETA_MODO_PRUEBA,
            "checkout_cancelado": request.GET.get("checkout") == "cancelled",
            "error_checkout": error_checkout,
        },
    )


@usuario_requerido
@require_GET
def estado_preparacion(request):
    slug = request.GET.get("slug", "")
    session_id = request.GET.get("session_id", "")
    try:
        validate_workspace_slug(slug)
    except ValidationError:
        return JsonResponse({"ready": False}, status=400)
    membership = (
        Membresia.objects.sin_alcance()
        .select_related("workspace")
        .filter(
            workspace__slug=slug,
        )
        .filter(
            Q(usuario=request.usuario) | Q(correo=request.usuario.correo),
            estado=Membresia.Estado.ACTIVO,
        )
        .first()
    )
    if membership is None and session_id:
        try:
            session = _stripe_client().checkout.Session.retrieve(session_id)
            metadata = _value(session, "metadata", {}) or {}
            if (
                _value(session, "status") == "complete"
                and _value(metadata, "slug") == slug
                and _value(metadata, "correo", "").strip().lower()
                == request.usuario.correo.strip().lower()
            ):
                subscription_id = _value(session, "subscription")
                if subscription_id:
                    subscription = _stripe_client().Subscription.retrieve(
                        str(subscription_id)
                    )
                    with transaction.atomic():
                        _create_workspace_from_checkout(session, subscription)
            membership = (
                Membresia.objects.sin_alcance()
                .select_related("workspace")
                .filter(
                    workspace__slug=slug,
                )
                .filter(
                    Q(usuario=request.usuario) | Q(correo=request.usuario.correo),
                    estado=Membresia.Estado.ACTIVO,
                )
                .first()
            )
        except CheckoutConflict as error:
            return JsonResponse({"ready": False, "error": str(error)}, status=409)
        except (ValueError, stripe.StripeError):
            logger.exception(
                "No se pudo reconciliar la sesión de Checkout %s.",
                session_id,
            )
    if membership is None:
        return JsonResponse({"ready": False})
    return JsonResponse(
        {
            "ready": True,
            "url": reverse(
                "resumen_workspace", args=[membership.workspace.uid]
            ),
        }
    )


def _value(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _record_conflict(event_id, event_type, message):
    EventoStripe.objects.update_or_create(
        stripe_event_id=event_id,
        defaults={"tipo": event_type, "procesado": True, "error": message[:300]},
    )


def _create_workspace_from_checkout(session, stripe_subscription):
    metadata = _value(session, "metadata", {}) or {}
    slug = _value(metadata, "slug", "")
    name = _value(metadata, "nombre", "")
    plan_id = _value(metadata, "plan", "")
    email = _value(metadata, "correo", "").strip().lower()
    subscription_id = _value(session, "subscription")
    customer_id = _value(session, "customer")
    if (
        not isinstance(slug, str)
        or not isinstance(name, str)
        or not isinstance(email, str)
        or not plan_por_id(plan_id)
        or not subscription_id
        or not customer_id
    ):
        raise ValueError("La metadata de Checkout está incompleta.")
    validate_workspace_slug(slug)
    if not name.strip() or len(name) > 80 or len(email) > 191:
        raise ValueError("Los datos de Checkout no son válidos.")
    if WorkspaceEliminacion.objects.filter(
        stripe_subscription_id=str(subscription_id)
    ).exists():
        raise CheckoutConflict(
            "La suscripción corresponde a una empresa ya eliminada."
        )
    trial_end = _value(stripe_subscription, "trial_end")
    if not isinstance(trial_end, (int, float)):
        raise ValueError("Stripe no proporcionó el vencimiento de la prueba.")
    if Workspace.objects.filter(slug=slug).exists():
        raise CheckoutConflict("El identificador de empresa ya está ocupado.")
    if PruebaUsada.objects.filter(correo=email).exists():
        raise CheckoutConflict(
            "Este correo ya tiene una empresa registrada. "
            "No puedes crear otra empresa con esta cuenta."
        )
    owner = Usuario.objects.filter(correo__iexact=email).first()
    workspace = Workspace.objects.create(
        slug=slug,
        nombre=name.strip(),
        plan=plan_id,
        estado=Workspace.Estado.ACTIVA,
    )
    Membresia.objects.para(workspace).create(
        correo=email,
        usuario=owner,
        rol=Membresia.Rol.PROPIETARIO,
        ver_leads=True,
        gestionar_leads=True,
        editar_cuestionarios=True,
        publicar_cuestionarios=True,
        estado=Membresia.Estado.ACTIVO,
    )
    SuscripcionWorkspace.objects.para(workspace).create(
        estado=SuscripcionWorkspace.Estado.PRUEBA,
        prueba_hasta=datetime.fromtimestamp(
            trial_end, tz=datetime_timezone.utc
        ),
        stripe_customer_id=str(customer_id),
        stripe_subscription_id=str(subscription_id),
        precio=Decimal("1.00"),
    )
    PruebaUsada.objects.create(correo=email, slug=slug)


def _subscription_for_event(obj, event_type):
    subscription_id = _value(obj, "subscription")
    if isinstance(subscription_id, dict):
        subscription_id = _value(subscription_id, "id")
    if not subscription_id:
        parent = _value(obj, "parent", {}) or {}
        details = _value(parent, "subscription_details", {}) or {}
        subscription_id = _value(details, "subscription")
        if isinstance(subscription_id, dict):
            subscription_id = _value(subscription_id, "id")
    if not subscription_id and event_type.startswith("customer.subscription."):
        subscription_id = _value(obj, "id")
    if not subscription_id:
        return None
    return (
        SuscripcionWorkspace.objects.sin_alcance()
        .select_related("workspace")
        .filter(stripe_subscription_id=str(subscription_id))
        .first()
    )


def _apply_subscription_event(subscription, event_type, obj):
    if subscription is None:
        return
    if event_type == "invoice.paid":
        status = SuscripcionWorkspace.Estado.ACTIVA
        workspace_status = Workspace.Estado.ACTIVA
    elif event_type == "invoice.payment_failed":
        status = SuscripcionWorkspace.Estado.PAGO_PENDIENTE
        workspace_status = None
    else:
        stripe_status = _value(obj, "status", "")
        if event_type == "customer.subscription.deleted" or stripe_status in {
            "canceled",
            "unpaid",
        }:
            status = SuscripcionWorkspace.Estado.CANCELADA
            workspace_status = Workspace.Estado.SUSPENDIDA
        elif stripe_status == "trialing":
            status = SuscripcionWorkspace.Estado.PRUEBA
            workspace_status = Workspace.Estado.ACTIVA
        elif stripe_status == "active":
            status = SuscripcionWorkspace.Estado.ACTIVA
            workspace_status = Workspace.Estado.ACTIVA
        else:
            status = SuscripcionWorkspace.Estado.PAGO_PENDIENTE
            workspace_status = None
    subscription.estado = status
    subscription.save(update_fields=["estado", "actualizado"])
    if workspace_status is not None and subscription.workspace.estado != workspace_status:
        subscription.workspace.estado = workspace_status
        subscription.workspace.save(update_fields=["estado"])


def _handle_stripe_event(event, stripe_subscription=None):
    event_type = _value(event, "type", "")
    data = _value(event, "data", {}) or {}
    obj = _value(data, "object", {}) or {}
    if event_type == "checkout.session.completed":
        if _value(obj, "mode") == "subscription":
            _create_workspace_from_checkout(obj, stripe_subscription)
        return
    if event_type in {
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        subscription = _subscription_for_event(obj, event_type)
        _apply_subscription_event(subscription, event_type, obj)


@csrf_exempt
@require_POST
def webhook_stripe(request):
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = _stripe_client().Webhook.construct_event(
            request.body,
            signature,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except (ValueError, stripe.SignatureVerificationError):
        return HttpResponse("Firma de Stripe no válida.", status=400)

    event_id = _value(event, "id", "")
    event_type = _value(event, "type", "")
    if not event_id or not event_type:
        return HttpResponse("Evento de Stripe incompleto.", status=400)
    if EventoStripe.objects.filter(
        stripe_event_id=event_id, procesado=True
    ).exists():
        return HttpResponse(status=200)
    stripe_subscription = None
    if event_type == "checkout.session.completed":
        data = _value(event, "data", {}) or {}
        obj = _value(data, "object", {}) or {}
        subscription_id = _value(obj, "subscription")
        if _value(obj, "mode") == "subscription" and subscription_id:
            try:
                stripe_subscription = _stripe_client().Subscription.retrieve(
                    str(subscription_id)
                )
            except stripe.StripeError:
                logger.exception(
                    "No se pudo consultar la suscripción Stripe del evento %s.",
                    event_id,
                )
                return HttpResponse(status=500)
    try:
        with transaction.atomic():
            EventoStripe.objects.create(
                stripe_event_id=event_id,
                tipo=event_type,
            )
            _handle_stripe_event(event, stripe_subscription)
            EventoStripe.objects.filter(stripe_event_id=event_id).update(
                procesado=True
            )
    except CheckoutConflict as error:
        data = _value(event, "data", {}) or {}
        obj = _value(data, "object", {}) or {}
        subscription_id = _value(obj, "subscription")
        if subscription_id:
            try:
                stripe_subscription = _stripe_client().Subscription.retrieve(
                    str(subscription_id)
                )
                if _value(stripe_subscription, "status") != "canceled":
                    _stripe_client().Subscription.cancel(str(subscription_id))
            except stripe.StripeError:
                logger.exception(
                    "No se pudo cancelar la suscripción conflictiva de Stripe; evento %s.",
                    event_id,
                )
                return HttpResponse("No se pudo cancelar la suscripción duplicada.", status=500)
        logger.error("Checkout de Stripe rechazado; evento %s: %s", event_id, error)
        try:
            _record_conflict(event_id, event_type, str(error))
        except IntegrityError:
            if not EventoStripe.objects.filter(stripe_event_id=event_id).exists():
                logger.exception(
                    "No se pudo registrar el conflicto de Checkout; evento %s.",
                    event_id,
                )
                return HttpResponse(status=500)
        return HttpResponse(status=200)
    except IntegrityError:
        if EventoStripe.objects.filter(stripe_event_id=event_id).exists():
            return HttpResponse(status=200)
        data = _value(event, "data", {}) or {}
        obj = _value(data, "object", {}) or {}
        metadata = _value(obj, "metadata", {}) or {}
        slug = _value(metadata, "slug", "")
        email = _value(metadata, "correo", "").strip().lower()
        conflict = (
            (slug and Workspace.objects.filter(slug=slug).exists())
            or (email and PruebaUsada.objects.filter(correo=email).exists())
        )
        if conflict:
            if _value(obj, "subscription"):
                try:
                    _stripe_client().Subscription.cancel(
                        str(_value(obj, "subscription"))
                    )
                except stripe.StripeError:
                    logger.exception(
                        "No se pudo cancelar una suscripción Stripe en conflicto; evento %s.",
                        event_id,
                    )
                    return HttpResponse(status=500)
            _record_conflict(
                event_id, event_type, "Conflicto concurrente de slug o prueba usada."
            )
            logger.error("Conflicto concurrente en checkout; evento %s.", event_id)
            return HttpResponse(status=200)
        logger.exception("Error de integridad al procesar evento Stripe %s.", event_id)
        return HttpResponse(status=500)
    except (ValidationError, ValueError):
        logger.exception("Evento Stripe inválido; evento %s.", event_id)
        return HttpResponse(status=400)
    except stripe.StripeError:
        logger.exception("Falló una operación Stripe al procesar evento %s.", event_id)
        return HttpResponse(status=500)
    return HttpResponse(status=200)


@usuario_requerido
@require_POST
def portal_suscripcion(request, workspace_uid):
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    membership = (
        Membresia.objects.para(workspace)
        .filter(usuario=request.usuario, estado=Membresia.Estado.ACTIVO)
        .first()
    )
    if (
        membership is None
        or membership.rol != Membresia.Rol.PROPIETARIO
        or workspace.plan == Workspace.Plan.INTERNO
    ):
        raise Http404
    subscription = (
        SuscripcionWorkspace.objects.para(workspace)
        .filter(stripe_customer_id__gt="")
        .first()
    )
    if subscription is None:
        raise Http404
    try:
        session = _stripe_client().billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=request.build_absolute_uri(
                reverse("resumen_workspace", args=[workspace.uid])
            ),
        )
    except stripe.StripeError:
        logger.exception(
            "No se pudo crear el portal de suscripción del workspace %s.",
            workspace.uid,
        )
        return HttpResponse("No se pudo abrir el portal de suscripción.", status=502)
    return redirect(session.url)
