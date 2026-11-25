import logging

import stripe
from django.conf import settings
from django.db import transaction

from contacts.models import Contacto, Diagnostico, Seguimiento
from funnels.models import Cuestionario, Popup, VersionCuestionario
from subscriptions.models import PruebaUsada, SuscripcionWorkspace
from users.models import AdminPlataforma
from workspaces.constants import CLEARIA_WORKSPACE_SLUG, PROTECTED_WORKSPACE_SLUGS
from workspaces.models import Membresia, Workspace, WorkspaceEliminacion


logger = logging.getLogger(__name__)


def asegurar_espacio_clearia(admins=None):
    with transaction.atomic():
        workspace, _ = Workspace.objects.get_or_create(
            slug=CLEARIA_WORKSPACE_SLUG,
            defaults={
                "nombre": "Clear-IA",
                "plan": Workspace.Plan.INTERNO,
            },
        )
        changed_fields = []
        if workspace.nombre != "Clear-IA":
            workspace.nombre = "Clear-IA"
            changed_fields.append("nombre")
        if workspace.plan != Workspace.Plan.INTERNO:
            workspace.plan = Workspace.Plan.INTERNO
            changed_fields.append("plan")
        if workspace.estado != Workspace.Estado.ACTIVA:
            workspace.estado = Workspace.Estado.ACTIVA
            changed_fields.append("estado")
        if changed_fields:
            workspace.save(update_fields=changed_fields)

        platform_admins = (
            admins
            if admins is not None
            else AdminPlataforma.objects.select_related("usuario").all()
        )
        for platform_admin in platform_admins:
            user = platform_admin.usuario
            memberships = Membresia.objects.para(workspace)
            membership = memberships.filter(usuario=user).first()
            values = {
                "usuario": user,
                "rol": Membresia.Rol.PROPIETARIO,
                "ver_leads": True,
                "gestionar_leads": True,
                "editar_cuestionarios": True,
                "publicar_cuestionarios": True,
                "estado": Membresia.Estado.ACTIVO,
            }
            if membership is not None:
                membership.correo = user.correo
                for field, value in values.items():
                    setattr(membership, field, value)
                membership.save()
            else:
                memberships.update_or_create(
                    correo=user.correo,
                    defaults=values,
                )
        return workspace


class WorkspaceDeletionError(Exception):
    pass


@transaction.atomic
def eliminar_workspace(workspace_uid, slug_confirmado, liberar_prueba=False):
    workspace = (
        Workspace.objects.select_for_update()
        .filter(uid=workspace_uid)
        .first()
    )
    if workspace is None:
        return {"ya_eliminada": True}
    if workspace.slug in PROTECTED_WORKSPACE_SLUGS:
        raise WorkspaceDeletionError(
            "Esta empresa está protegida y no se puede eliminar."
        )
    if slug_confirmado != workspace.slug:
        raise WorkspaceDeletionError(
            "Escribe el identificador exacto de la empresa."
        )

    tiene_propietario_activo = Membresia.objects.para(workspace).filter(
        rol=Membresia.Rol.PROPIETARIO,
        estado=Membresia.Estado.ACTIVO,
        usuario__activo=True,
    ).exists()
    if (
        workspace.estado != Workspace.Estado.SUSPENDIDA
        and tiene_propietario_activo
    ):
        raise WorkspaceDeletionError(
            "Solo se puede eliminar una empresa suspendida o sin propietario activo."
        )

    subscription = (
        SuscripcionWorkspace.objects.para(workspace)
        .select_for_update()
        .first()
    )
    stripe_subscription_id = (
        subscription.stripe_subscription_id if subscription else ""
    )
    if stripe_subscription_id:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            remote_subscription = stripe.Subscription.retrieve(
                stripe_subscription_id
            )
            if remote_subscription.status != "canceled":
                stripe.Subscription.cancel(stripe_subscription_id)
        except stripe.StripeError as error:
            logger.exception(
                "No se pudo cancelar la suscripción al eliminar el workspace %s.",
                workspace.uid,
            )
            raise WorkspaceDeletionError(
                "No se pudo cancelar la suscripción de Stripe; la empresa se conserva."
            ) from error

    WorkspaceEliminacion.objects.get_or_create(
        stripe_subscription_id=stripe_subscription_id or None,
        defaults={"slug": workspace.slug},
    )

    contacts = Contacto.objects.para(workspace)
    questionnaires = Cuestionario.objects.para(workspace)
    summary = {
        "ya_eliminada": False,
        "contactos": contacts.count(),
        "diagnosticos": Diagnostico.objects.para(workspace).count(),
        "seguimientos": Seguimiento.objects.para(workspace).count(),
        "cuestionarios": questionnaires.count(),
        "versiones": VersionCuestionario.objects.para(workspace).count(),
        "miembros": Membresia.objects.para(workspace).count(),
        "suscripciones": int(subscription is not None),
        "popups": Popup.objects.para(workspace).count(),
        "empresas": 1,
        "pruebas_liberadas": 0,
    }

    Popup.objects.para(workspace).delete()
    contacts.delete()
    if liberar_prueba:
        summary["pruebas_liberadas"], _ = PruebaUsada.objects.filter(
            slug=workspace.slug
        ).delete()
    if subscription is not None:
        subscription.delete()
    Membresia.objects.para(workspace).delete()
    questionnaires.delete()
    workspace.delete()
    return summary
