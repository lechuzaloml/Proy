from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from funnels.models import Cuestionario, Popup
from workspaces.models import Workspace


class ErrorPopup(ValueError):
    def __init__(self, message="", field_errors=None):
        self.field_errors = field_errors or {}
        super().__init__(message)


@transaction.atomic
def guardar_popup(workspace, popup_uid, form, action):
    locked_workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
    if locked_workspace.estado != Workspace.Estado.ACTIVA:
        raise ErrorPopup("La empresa debe estar activa para editar su evento.")
    popup = (
        Popup.objects.para(locked_workspace)
        .select_for_update()
        .filter(uid=popup_uid)
        .first()
        if popup_uid
        else None
    )
    if popup_uid and popup is None:
        raise ErrorPopup("El evento no pertenece a esta empresa.")

    if action == "volver_borrador":
        if popup is None:
            raise ErrorPopup("No hay un evento que pueda volver a borrador.")
        popup.estado = Popup.Estado.BORRADOR
        popup.save(update_fields=["estado", "actualizado"])
        return popup

    if popup is None:
        popup = form.instance
    else:
        for field in (
            "titulo",
            "insignia",
            "resumen",
            "imagen_url",
            "fecha_evento",
            "anfitrion_nombre",
            "anfitrion_foto_url",
            "cuestionario",
        ):
            setattr(popup, field, form.cleaned_data[field])
        form.instance = popup
    popup.workspace = locked_workspace
    popup = form.save(commit=False)
    popup.workspace = locked_workspace
    if action == "revision":
        popup.estado = Popup.Estado.PENDIENTE
    elif popup.estado == Popup.Estado.PUBLICADO:
        popup.estado = Popup.Estado.PENDIENTE
    else:
        popup.estado = Popup.Estado.BORRADOR
    try:
        popup.full_clean()
    except ValidationError as error:
        if hasattr(error, "error_dict"):
            field_errors = {
                field: [
                    message
                    for item in field_errors
                    for message in item.messages
                ]
                for field, field_errors in error.error_dict.items()
            }
            raise ErrorPopup(field_errors=field_errors) from error
        raise ErrorPopup(str(error)) from error
    popup.save()
    return popup


@transaction.atomic
def moderar_popup(popup_uid, action, *, motivo_rechazo="", usuario=None):
    popup = (
        Popup.objects.sin_alcance()
        .select_for_update()
        .select_related("workspace", "cuestionario")
        .filter(uid=popup_uid)
        .first()
    )
    if popup is None:
        raise ErrorPopup("El evento ya no está disponible.")
    update_fields = ["estado", "actualizado"]
    if action == "aprobar":
        if popup.estado != Popup.Estado.PENDIENTE:
            raise ErrorPopup("Solo se pueden aprobar eventos pendientes.")
        if popup.workspace.estado != Workspace.Estado.ACTIVA:
            raise ErrorPopup("No se puede aprobar un evento de una empresa inactiva.")
        if (
            popup.cuestionario is None
            or popup.cuestionario.estado != Cuestionario.Estado.PUBLICADO
        ):
            raise ErrorPopup("El evento requiere un cuestionario publicado.")
        popup.estado = Popup.Estado.PUBLICADO
        try:
            popup.full_clean()
        except ValidationError as error:
            raise ErrorPopup(" ".join(error.messages)) from error
    elif action == "rechazar":
        if popup.estado != Popup.Estado.PENDIENTE:
            raise ErrorPopup("Solo se pueden rechazar eventos pendientes.")
        if not isinstance(motivo_rechazo, str) or not motivo_rechazo.strip():
            raise ErrorPopup("Escribe el motivo del rechazo.")
        if usuario is None:
            raise ErrorPopup("No se pudo identificar al administrador de plataforma.")
        popup.estado = Popup.Estado.RECHAZADO
        popup.motivo_rechazo = motivo_rechazo
        popup.rechazado_por = usuario
        popup.rechazado_en = timezone.now()
        update_fields.extend(
            ["motivo_rechazo", "rechazado_por", "rechazado_en"]
        )
    elif action == "despublicar":
        if popup.estado != Popup.Estado.PUBLICADO:
            raise ErrorPopup("Solo se pueden despublicar eventos publicados.")
        popup.estado = Popup.Estado.BORRADOR
    else:
        raise ErrorPopup("La acción solicitada no es válida.")
    popup.save(update_fields=update_fields)
    return popup


def eventos_publicos():
    return (
        Popup.objects.sin_alcance()
        .filter(
            estado=Popup.Estado.PUBLICADO,
            vence_en__gt=timezone.now(),
            workspace__estado=Workspace.Estado.ACTIVA,
            cuestionario__estado=Cuestionario.Estado.PUBLICADO,
        )
        .select_related("workspace", "cuestionario")
        .order_by("fecha_evento", "actualizado")[:10]
    )
