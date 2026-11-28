import uuid

from django.db import models


class TimestampedUUIDModel(models.Model):
    uid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class WorkspaceScopeRequired(RuntimeError):
    pass


class WorkspaceScopedQuerySet(models.QuerySet):
    def _clone(self):
        clone = super()._clone()
        clone._workspace_scope = getattr(self, "_workspace_scope", None)
        clone._workspace_value = getattr(self, "_workspace_value", None)
        return clone

    def para(self, workspace):
        scoped = self._chain()
        scoped._workspace_scope = workspace.pk
        scoped._workspace_value = workspace
        return scoped.filter(workspace=workspace)

    def create(self, **kwargs):
        scope = getattr(self, "_workspace_scope", None)
        if scope is not None:
            workspace = kwargs.get("workspace")
            workspace_id = getattr(workspace, "pk", workspace)
            if workspace is not None and workspace_id != scope:
                raise ValueError("No se puede crear un objeto en otro workspace.")
            kwargs["workspace"] = self._workspace_value
        return super().create(**kwargs)

    def bulk_create(self, objs, **kwargs):
        scope = getattr(self, "_workspace_scope", None)
        if scope is not None:
            for obj in objs:
                if obj.workspace_id not in (None, scope):
                    raise ValueError("No se puede crear un objeto en otro workspace.")
                obj.workspace = self._workspace_value
        return super().bulk_create(objs, **kwargs)

    def bulk_update(self, objs, fields, **kwargs):
        if getattr(self, "_workspace_scope", None) is not None and {
            "workspace",
            "workspace_id",
        }.intersection(fields):
            raise ValueError("No se puede cambiar el workspace desde una consulta acotada.")
        return super().bulk_update(objs, fields, **kwargs)

    def update(self, **kwargs):
        if getattr(self, "_workspace_scope", None) is not None and {
            "workspace",
            "workspace_id",
        }.intersection(kwargs):
            raise ValueError("No se puede cambiar el workspace desde una consulta acotada.")
        return super().update(**kwargs)


class WorkspaceScopedManager(models.Manager.from_queryset(WorkspaceScopedQuerySet)):
    def get_queryset(self):
        raise WorkspaceScopeRequired(
            "La consulta requiere un alcance explícito: "
            ".objects.para(workspace) o .objects.sin_alcance()."
        )

    def para(self, workspace):
        if workspace is None or getattr(workspace, "pk", None) is None:
            raise ValueError("Se requiere un workspace persistido.")
        return super().get_queryset().para(workspace)

    def sin_alcance(self):
        return super().get_queryset()


class WorkspaceScopedModel(TimestampedUUIDModel):
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
    )

    objects = WorkspaceScopedManager()

    class Meta:
        abstract = True
