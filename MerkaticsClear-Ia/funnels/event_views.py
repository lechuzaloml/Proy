import logging
import uuid
from datetime import datetime

from django.contrib import messages
from django.db import DatabaseError, IntegrityError, transaction
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_POST

from contacts.models import Contacto, Diagnostico
from contacts.services import permitir_envio
from funnels.constants import (
    ORIGEN_EVENTO,
    TEXTO_AVISO_PRIVACIDAD,
    VERSION_AVISO_PRIVACIDAD,
)
from funnels.event_services import ErrorPopup, guardar_popup, moderar_popup
from funnels.forms import (
    EventoGeneralDemoForm,
    EventoRegistroForm,
    EventoRespuestasForm,
    MotivoRechazoPopupForm,
    PopupEventoForm,
)
from funnels.models import Cuestionario, Popup, VersionCuestionario
from funnels.motor import ErrorRespuestas, calcular_perfil_secciones, calcular_resultado, validar_respuestas
from funnels.views import (
    _build_flow_context,
    _read_posted_answers,
    _validar_longitudes_respuestas,
)
from workspaces.models import Membresia, Workspace
from workspaces.permisos import tiene_permiso
from workspaces.views import _contexto_consola_plataforma


logger = logging.getLogger(__name__)
from workspaces.views import plataforma_requerida


HORARIOS_EVENTO_GENERAL = (
    "9:30 a. m. (hora de Ciudad de México)",
    "3:30 p. m. (hora de Ciudad de México)",
)
EVENT_FORM_FIELD_ALIASES = {
    "horarios": "horarios_texto",
    "puntos": "puntos_texto",
    "vence_en": "fecha_evento",
}


def _session_key(popup):
    return f"registro_evento_{popup.uid}"


def _confirmation_session_key(popup, contact_uid):
    return f"confirmacion_evento_{popup.uid}_{contact_uid}"


def _see_other(url):
    response = HttpResponse(status=303)
    response["Location"] = url
    return response


def _available_popup(slug):
    popup = (
        Popup.objects.sin_alcance()
        .select_related("workspace", "cuestionario")
        .filter(
            workspace__slug=slug,
            workspace__estado=Workspace.Estado.ACTIVA,
            estado=Popup.Estado.PUBLICADO,
            vence_en__gt=timezone.now(),
            cuestionario__estado=Cuestionario.Estado.PUBLICADO,
        )
        .first()
    )
    if popup is None:
        return None, None
    version = (
        VersionCuestionario.objects.para(popup.workspace)
        .filter(
            cuestionario=popup.cuestionario,
            numero=popup.cuestionario.version_actual,
            publicada=True,
        )
        .first()
    )
    if version is None:
        return None, None
    return popup, version


def evento_no_disponible(request):
    return render(
        request,
        "funnels/evento_no_disponible.html",
        status=404,
    )


@never_cache
@require_http_methods(["GET", "POST"])
def registro_evento_general(request):
    form = EventoGeneralDemoForm(
        request.POST if request.method == "POST" else None,
        horarios=HORARIOS_EVENTO_GENERAL,
        initial={"lada": "+52"},
    )
    registro_no_guardado = False
    if request.method == "POST" and form.is_valid():
        registro_no_guardado = True
        form = EventoGeneralDemoForm(
            horarios=HORARIOS_EVENTO_GENERAL,
            initial={"lada": "+52"},
        )
    return render(
        request,
        "funnels/registro_evento_general.html",
        {
            "form": form,
            "horarios": HORARIOS_EVENTO_GENERAL,
            "registro_no_guardado": registro_no_guardado,
            "footer_compact": True,
        },
    )


@require_http_methods(["GET"])
@never_cache
def registro_evento(request, slug):
    popup, _version = _available_popup(slug)
    if popup is None:
        return evento_no_disponible(request)

    form = EventoRegistroForm(horarios=popup.horarios)
    return render(
        request,
        "funnels/registro_evento.html",
        {
            "popup": popup,
            "form": form,
            "workspace": popup.workspace,
            "texto_aviso_privacidad": TEXTO_AVISO_PRIVACIDAD,
            "footer_compact": True,
        },
    )


@require_POST
@never_cache
def registrar_evento(request, slug):
    popup, _version = _available_popup(slug)
    if popup is None:
        return evento_no_disponible(request)

    form = EventoRegistroForm(request.POST, horarios=popup.horarios)
    if not form.is_valid():
        return render(
            request,
            "funnels/registro_evento.html",
            {
                "popup": popup,
                "form": form,
                "workspace": popup.workspace,
                "texto_aviso_privacidad": TEXTO_AVISO_PRIVACIDAD,
                "footer_compact": True,
            },
            status=400,
        )

    consented_at = timezone.now()
    request.session[_session_key(popup)] = {
        "attempt_id": str(uuid.uuid4()),
        "nombre": form.cleaned_data["nombre"].strip(),
        "apellido": form.cleaned_data["apellido"].strip(),
        "correo": form.cleaned_data["correo"],
        "telefono": form.cleaned_data["telefono"],
        "horario": form.cleaned_data["horario"],
        "consentimiento_version": VERSION_AVISO_PRIVACIDAD,
        "consentimiento_fecha": consented_at.isoformat(),
    }
    return _see_other(
        reverse("cuestionario_evento", args=[slug])
    )


@require_http_methods(["GET", "POST"])
@never_cache
def cuestionario_evento(request, slug):
    popup, version = _available_popup(slug)
    if popup is None:
        return evento_no_disponible(request)

    registration_key = _session_key(popup)
    registration = request.session.get(registration_key)
    if not registration:
        return _see_other(reverse("registro_evento", args=[slug]))

    form = EventoRespuestasForm(
        request.POST if request.method == "POST" else None,
        initial={"respuestas": "{}"},
    )
    flow = _build_flow_context(
        version.configuracion,
        popup.titulo,
        popup.workspace.nombre,
        "final",
        False,
        form,
        _read_posted_answers(request)["posted_answers"]
        if request.method == "POST"
        else {},
    )
    if request.method == "POST" and not form.is_valid():
        return render(
            request,
            "funnels/cuestionario_evento.html",
            {
                "popup": popup,
                "question_rows": flow["question_rows"],
                "answers_form": form,
                "workspace": popup.workspace,
                "footer_compact": True,
            },
            status=400,
        )

    if request.method == "POST":
        try:
            _validar_longitudes_respuestas(
                version.configuracion, form.cleaned_data["respuestas"]
            )
            normalized = validar_respuestas(
                version.configuracion, form.cleaned_data["respuestas"]
            )
            result = calcular_resultado(version.configuracion, normalized)
            profile = calcular_perfil_secciones(version.configuracion, normalized)
        except ErrorRespuestas as error:
            form.add_error(None, str(error))
            return render(
                request,
                "funnels/cuestionario_evento.html",
                {
                    "popup": popup,
                    "question_rows": flow["question_rows"],
                    "answers_form": form,
                    "workspace": popup.workspace,
                    "footer_compact": True,
                },
                status=400,
            )

        try:
            attempt_id = uuid.UUID(registration["attempt_id"])
            consented_at = datetime.fromisoformat(
                registration["consentimiento_fecha"]
            )
        except (KeyError, TypeError, ValueError):
            request.session.pop(registration_key, None)
            return _see_other(reverse("registro_evento", args=[slug]))
        if not timezone.is_aware(consented_at):
            request.session.pop(registration_key, None)
            return _see_other(reverse("registro_evento", args=[slug]))

        contact = Contacto.objects.para(popup.workspace).filter(
            attempt_id=attempt_id
        ).first()
        if contact is not None:
            diagnosis = Diagnostico.objects.para(popup.workspace).filter(
                contacto=contact,
                cuestionario=popup.cuestionario,
            ).first()
            if diagnosis is None:
                raise RuntimeError(
                    "Se encontró un contacto de evento sin su diagnóstico."
                )
        else:
            if not permitir_envio(request.META.get("REMOTE_ADDR")):
                return HttpResponse(
                    "Se alcanzó el límite temporal de envíos. Intenta de nuevo más tarde.",
                    status=429,
                    content_type="text/plain; charset=utf-8",
                )
            responses = dict(normalized)
            responses["horario_evento"] = registration["horario"]
            try:
                with transaction.atomic():
                    contact = Contacto.objects.para(popup.workspace).create(
                        attempt_id=attempt_id,
                        nombre=(
                            f"{registration['nombre']} "
                            f"{registration['apellido']}"
                        ).strip(),
                        correo=registration["correo"],
                        telefono=registration["telefono"],
                        consentimiento_version=registration[
                            "consentimiento_version"
                        ],
                        consentimiento_fecha=consented_at,
                        origen=ORIGEN_EVENTO,
                        ultima_actividad=timezone.now(),
                    )
                    Diagnostico.objects.para(popup.workspace).create(
                        contacto=contact,
                        cuestionario=popup.cuestionario,
                        version=version.numero,
                        respuestas=responses,
                        puntaje_total=result["puntaje_total"],
                        puntaje_maximo=result["puntaje_maximo"],
                        porcentaje=result["porcentaje"],
                        segmento=result["segmento"],
                        puntaje_por_dimension={
                            dimension["nombre"]: dimension["porcentaje"]
                            for dimension in profile
                        },
                        resultado=result["resultado"],
                    )
            except IntegrityError:
                contact = Contacto.objects.para(popup.workspace).filter(
                    attempt_id=attempt_id
                ).first()
                if contact is None:
                    raise
                diagnosis = Diagnostico.objects.para(popup.workspace).filter(
                    contacto=contact,
                    cuestionario=popup.cuestionario,
                ).first()
                if diagnosis is None:
                    raise
            else:
                diagnosis = Diagnostico.objects.para(popup.workspace).get(
                    contacto=contact,
                    cuestionario=popup.cuestionario,
                )

        request.session.pop(registration_key, None)
        request.session[
            _confirmation_session_key(popup, contact.uid)
        ] = True
        return _see_other(
            reverse(
                "confirmacion_evento",
                args=[slug, contact.uid],
            )
        )

    return render(
        request,
        "funnels/cuestionario_evento.html",
        {
            "popup": popup,
            "question_rows": flow["question_rows"],
            "answers_form": form,
            "workspace": popup.workspace,
            "footer_compact": True,
        },
    )


@require_http_methods(["GET"])
@never_cache
def confirmacion_evento(request, slug, uid):
    workspace = get_object_or_404(
        Workspace,
        slug=slug,
        estado=Workspace.Estado.ACTIVA,
    )
    popup = get_object_or_404(
        Popup.objects.sin_alcance().select_related("cuestionario"),
        workspace=workspace,
    )
    if not request.session.get(_confirmation_session_key(popup, uid)):
        raise Http404
    contact = get_object_or_404(
        Contacto.objects.para(workspace),
        uid=uid,
        origen=ORIGEN_EVENTO,
    )
    diagnosis = get_object_or_404(
        Diagnostico.objects.para(workspace),
        contacto=contact,
        cuestionario=popup.cuestionario,
    )
    return _confirmation(request, popup, contact, diagnosis)


def _confirmation(request, popup, contact, diagnosis):
    profile = []
    if len(diagnosis.puntaje_por_dimension) >= 2:
        profile = [
            {"nombre": name, "porcentaje": percentage}
            for name, percentage in diagnosis.puntaje_por_dimension.items()
        ]
    return render(
        request,
        "funnels/confirmacion_evento.html",
        {
            "popup": popup,
            "nombre_contacto": contact.nombre.split()[0],
            "horario_confirmado": diagnosis.respuestas.get("horario_evento", ""),
            "perfil_evento": profile,
            "workspace": popup.workspace,
            "return_url": reverse(
                "registro_evento", args=[popup.workspace.slug]
            ),
            "footer_compact": True,
        },
    )


@require_http_methods(["GET", "POST"])
def mi_evento(request, workspace_uid):
    if request.usuario is None:
        return redirect(f"{reverse('acceso')}?next={reverse('mi_evento', args=[workspace_uid])}")
    workspace = get_object_or_404(Workspace, uid=workspace_uid)
    membership = get_object_or_404(
        Membresia.objects.para(workspace),
        usuario=request.usuario,
        estado=Membresia.Estado.ACTIVO,
        rol__in=[Membresia.Rol.PROPIETARIO, Membresia.Rol.ADMIN],
    )
    popup = Popup.objects.para(workspace).first()
    if request.method == "POST":
        action = request.POST.get("accion", "")
        if action == "volver_borrador":
            form = PopupEventoForm(
                workspace=workspace,
                instance=popup,
            )
        else:
            form = PopupEventoForm(
                request.POST,
                workspace=workspace,
                instance=popup,
            )
        if action not in {"borrador", "revision", "volver_borrador"}:
            form.add_error(None, "La acción solicitada no es válida.")
        elif form.is_valid() or action == "volver_borrador":
            try:
                saved = guardar_popup(
                    workspace,
                    popup.uid if popup else None,
                    form,
                    action,
                )
            except ErrorPopup as error:
                if error.field_errors:
                    for field_name, field_errors in error.field_errors.items():
                        form_field = EVENT_FORM_FIELD_ALIASES.get(
                            field_name, field_name
                        )
                        if form_field in form.fields:
                            for field_error in field_errors:
                                form.add_error(form_field, field_error)
                        else:
                            label = field_name.replace("_", " ").capitalize()
                            for field_error in field_errors:
                                form.add_error(
                                    None,
                                    f"{label}: {field_error}",
                                )
                else:
                    form.add_error(None, str(error))
            else:
                if action == "revision":
                    messages.success(
                        request,
                        "El evento se envió correctamente a revisión.",
                    )
                else:
                    messages.success(
                        request,
                        "Los cambios del evento se guardaron correctamente.",
                    )
                return redirect("mi_evento", workspace_uid=saved.workspace.uid)
    else:
        form = PopupEventoForm(workspace=workspace, instance=popup)
    can_view_contacts = tiene_permiso(membership, "ver_leads")
    can_edit_questionnaires = tiene_permiso(
        membership, "editar_cuestionarios"
    )
    can_publish_questionnaires = tiene_permiso(
        membership, "publicar_cuestionarios"
    )
    return render(
        request,
        "funnels/mi_evento.html",
        {
            "workspace": workspace,
            "membresia": membership,
            "popup": popup,
            "form": form,
            "accion": action if request.method == "POST" else "",
            "nav_active": "evento",
            "puede_ver_resumen": True,
            "puede_ver_leads": can_view_contacts,
            "puede_ver_cuestionarios": (
                can_edit_questionnaires or can_publish_questionnaires
            ),
            "puede_editar_cuestionarios": can_edit_questionnaires,
            "puede_administrar_miembros": True,
            "footer_compact": False,
        },
        status=400 if request.method == "POST" and form.errors else 200,
    )


@plataforma_requerida
@require_POST
def moderar_evento(request, popup_uid):
    action = request.POST.get("accion", "")
    if action == "rechazar":
        form = MotivoRechazoPopupForm(request.POST)
        if not form.is_valid():
            return _render_error_rechazo(request, popup_uid, form, status=400)
        try:
            moderar_popup(
                popup_uid,
                action,
                motivo_rechazo=form.cleaned_data["motivo"],
                usuario=request.usuario,
            )
        except ErrorPopup as error:
            form.add_error(None, str(error))
            return _render_error_rechazo(request, popup_uid, form, status=400)
        except DatabaseError:
            logger.exception(
                "No se pudo guardar el rechazo del popup %s",
                popup_uid,
            )
            form.add_error(
                None,
                "No se pudo guardar el rechazo. El motivo se conservó; vuelve a intentarlo.",
            )
            return _render_error_rechazo(request, popup_uid, form, status=500)
        messages.success(request, "Evento rechazado. El motivo quedó guardado.")
        return redirect("consola_plataforma")

    try:
        moderar_popup(popup_uid, action)
    except ErrorPopup as error:
        messages.error(request, str(error))
    else:
        messages.success(request, "Estado del evento actualizado.")
    return redirect("consola_plataforma")


def _render_error_rechazo(request, popup_uid, form, *, status):
    return render(
        request,
        "workspaces/plataforma.html",
        _contexto_consola_plataforma(
            request,
            rechazo_popup_uid=popup_uid,
            rechazo_form=form,
        ),
        status=status,
    )
