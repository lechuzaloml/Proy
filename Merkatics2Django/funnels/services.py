import copy

from django.db import transaction

from funnels.models import Cuestionario, VersionCuestionario
from funnels.motor import validar_cuestionario
from subscriptions.planes import limite_cuestionarios_publicados
from workspaces.models import Workspace


class ErrorPublicacion(ValueError):
    pass


def _bloquear_workspace(workspace):
    return Workspace.objects.select_for_update().get(pk=workspace.pk)


def publicar_cuestionario(workspace, uid):
    with transaction.atomic():
        workspace_bloqueado = _bloquear_workspace(workspace)
        if workspace_bloqueado.estado != Workspace.Estado.ACTIVA:
            raise ErrorPublicacion(
                "La empresa está suspendida y no puede publicar cuestionarios."
            )

        try:
            cuestionario = (
                Cuestionario.objects.para(workspace_bloqueado)
                .select_for_update()
                .get(uid=uid, estado=Cuestionario.Estado.BORRADOR)
            )
        except Cuestionario.DoesNotExist as error:
            raise ErrorPublicacion(
                "El cuestionario ya no está disponible para publicar."
            ) from error

        errors = validar_cuestionario(cuestionario.configuracion)
        if errors:
            raise ErrorPublicacion(
                "No se puede publicar una configuración inválida: "
                + " ".join(errors)
            )
        if not isinstance(cuestionario.configuracion.get("preguntas"), list) or not cuestionario.configuracion["preguntas"]:
            raise ErrorPublicacion(
                "No se puede publicar: configura al menos una pregunta."
            )
        configuration = copy.deepcopy(cuestionario.configuracion)
        configuration["estado"] = Cuestionario.Estado.PUBLICADO

        limit = limite_cuestionarios_publicados(workspace_bloqueado.plan)
        published_count = Cuestionario.objects.para(workspace_bloqueado).filter(
            estado=Cuestionario.Estado.PUBLICADO
        ).count()
        if limit is not None and published_count >= limit:
            raise ErrorPublicacion(
                "Alcanzaste el límite de tu plan: despublica uno o cambia de plan"
            )

        latest_version = (
            VersionCuestionario.objects.para(workspace_bloqueado)
            .filter(cuestionario=cuestionario)
            .order_by("-numero")
            .first()
        )
        version_number = (
            latest_version.numero + 1
            if latest_version is not None
            else cuestionario.version_actual
        )
        VersionCuestionario.objects.para(workspace_bloqueado).create(
            cuestionario=cuestionario,
            numero=version_number,
            configuracion=configuration,
            publicada=True,
        )
        cuestionario.version_actual = version_number
        cuestionario.configuracion = configuration
        cuestionario.estado = Cuestionario.Estado.PUBLICADO
        cuestionario.save(
            update_fields=[
                "version_actual",
                "configuracion",
                "estado",
                "actualizado",
            ]
        )
        return cuestionario


def despublicar_cuestionario(workspace, uid):
    with transaction.atomic():
        workspace_bloqueado = _bloquear_workspace(workspace)
        try:
            cuestionario = (
                Cuestionario.objects.para(workspace_bloqueado)
                .select_for_update()
                .get(uid=uid, estado=Cuestionario.Estado.PUBLICADO)
            )
        except Cuestionario.DoesNotExist as error:
            raise ErrorPublicacion(
                "El cuestionario ya no está publicado."
            ) from error

        configuration = copy.deepcopy(cuestionario.configuracion)
        configuration["estado"] = Cuestionario.Estado.BORRADOR
        cuestionario.estado = Cuestionario.Estado.BORRADOR
        cuestionario.configuracion = configuration
        cuestionario.save(
            update_fields=["estado", "configuracion", "actualizado"]
        )
        return cuestionario
