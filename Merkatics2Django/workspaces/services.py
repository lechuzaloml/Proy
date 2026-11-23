from django.db import transaction

from users.models import AdminPlataforma
from workspaces.models import Membresia, Workspace


def asegurar_espacio_clearia(admins=None):
    with transaction.atomic():
        workspace, _ = Workspace.objects.get_or_create(
            slug="clearia",
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
