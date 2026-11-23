from django.core.exceptions import ValidationError
from django.db import models

from core.models import (
    WorkspaceScopedManager,
    WorkspaceScopedModel,
    WorkspaceScopedQuerySet,
)


class ImmutableVersionQuerySet(WorkspaceScopedQuerySet):
    def update(self, **kwargs):
        raise ValidationError("Las versiones de cuestionario son inmutables.")

    def bulk_update(self, objs, fields, **kwargs):
        raise ValidationError("Las versiones de cuestionario son inmutables.")

    def delete(self):
        raise ValidationError("Las versiones de cuestionario son inmutables.")


ImmutableVersionManager = WorkspaceScopedManager.from_queryset(
    ImmutableVersionQuerySet
)


class Plantilla(models.Model):
    class Tipo(models.TextChoices):
        BIBLIOTECA = "biblioteca", "Biblioteca"
        REFERENCIA = "referencia", "Referencia"

    slug = models.SlugField(max_length=100, unique=True)
    nombre = models.CharField(max_length=200)
    formato = models.CharField(max_length=100, blank=True)
    caso_uso = models.CharField(max_length=150, blank=True)
    nicho = models.CharField(max_length=150, blank=True)
    descripcion = models.TextField(blank=True)
    configuracion = models.JSONField()
    tipo = models.CharField(
        max_length=12, choices=Tipo.choices, default=Tipo.BIBLIOTECA
    )

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Cuestionario(WorkspaceScopedModel):
    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        PUBLICADO = "publicado", "Publicado"

    nombre = models.CharField(max_length=200)
    estado = models.CharField(
        max_length=10, choices=Estado.choices, default=Estado.BORRADOR
    )
    configuracion = models.JSONField()
    version_actual = models.PositiveIntegerField(default=1)
    creado_por = models.ForeignKey(
        "users.Usuario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuestionarios_creados",
    )

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class VersionCuestionario(WorkspaceScopedModel):
    objects = ImmutableVersionManager()

    cuestionario = models.ForeignKey(
        Cuestionario,
        on_delete=models.CASCADE,
        related_name="versiones",
    )
    numero = models.PositiveIntegerField()
    configuracion = models.JSONField()
    publicada = models.BooleanField(default=False)

    class Meta:
        ordering = ["-numero"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "cuestionario", "numero"],
                name="uniq_workspace_questionnaire_version",
            )
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Las versiones de cuestionario son inmutables.")
        if (
            self.workspace_id is not None
            and self.cuestionario_id is not None
            and self.workspace_id != self.cuestionario.workspace_id
        ):
            raise ValidationError(
                "La versión y el cuestionario deben pertenecer al mismo workspace."
            )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Las versiones de cuestionario son inmutables.")

    def __str__(self):
        return f"{self.cuestionario} · v{self.numero}"
