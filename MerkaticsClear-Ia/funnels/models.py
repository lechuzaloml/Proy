import uuid
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import models
from django.utils import timezone

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


class Popup(models.Model):
    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        PENDIENTE = "pendiente", "Pendiente"
        PUBLICADO = "publicado", "Publicado"
        RECHAZADO = "rechazado", "Rechazado"

    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="popup_evento",
    )
    titulo = models.CharField(max_length=160, blank=True)
    insignia = models.CharField(max_length=100, blank=True)
    resumen = models.CharField(max_length=500, blank=True)
    imagen_url = models.URLField(
        max_length=2048,
        blank=True,
        validators=[URLValidator(schemes=["https"])],
    )
    fecha_evento = models.DateTimeField(null=True, blank=True)
    vence_en = models.DateTimeField(null=True, blank=True)
    horarios = models.JSONField(default=list, blank=True)
    anfitrion_nombre = models.CharField(max_length=120, blank=True)
    anfitrion_foto_url = models.URLField(
        max_length=2048,
        blank=True,
        validators=[URLValidator(schemes=["https"])],
    )
    puntos = models.JSONField(default=list, blank=True)
    cuestionario = models.ForeignKey(
        Cuestionario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="popups_evento",
    )
    estado = models.CharField(
        max_length=12,
        choices=Estado.choices,
        default=Estado.BORRADOR,
    )
    motivo_rechazo = models.TextField(blank=True, default="")
    rechazado_por = models.ForeignKey(
        "users.Usuario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="popups_rechazados",
    )
    rechazado_en = models.DateTimeField(null=True, blank=True)
    actualizado = models.DateTimeField(auto_now=True)

    objects = WorkspaceScopedManager()

    def validate_unique(self, exclude=None):
        excluded = set(exclude or ())
        errors = {}
        manager = type(self).objects

        if "uid" not in excluded:
            uid_matches = manager.sin_alcance().filter(uid=self.uid)
            if self.pk:
                uid_matches = uid_matches.exclude(pk=self.pk)
            if uid_matches.exists():
                errors["uid"] = self.unique_error_message(type(self), ("uid",))

        if "workspace" not in excluded and self.workspace_id:
            workspace_matches = manager.para(self.workspace)
            if self.pk:
                workspace_matches = workspace_matches.exclude(pk=self.pk)
            if workspace_matches.exists():
                errors["workspace"] = self.unique_error_message(
                    type(self), ("workspace",)
                )

        if errors:
            raise ValidationError(errors)

    def clean(self):
        errors = {}
        if self.cuestionario_id:
            if self.cuestionario.workspace_id != self.workspace_id:
                errors["cuestionario"] = (
                    "El cuestionario debe pertenecer a la misma empresa."
                )
            elif self.cuestionario.estado != Cuestionario.Estado.PUBLICADO:
                errors["cuestionario"] = "Selecciona un cuestionario publicado."

        if not isinstance(self.horarios, list) or len(self.horarios) > 4:
            errors["horarios"] = "Agrega como máximo cuatro horarios."
        elif any(
            not isinstance(item, str) or not item.strip() or len(item) > 120
            for item in self.horarios
        ):
            errors["horarios"] = (
                "Cada horario debe ser texto de hasta 120 caracteres."
            )

        if not isinstance(self.puntos, list) or len(self.puntos) > 4:
            errors["puntos"] = "Agrega como máximo cuatro puntos."
        elif any(
            not isinstance(item, dict)
            or not isinstance(item.get("titulo"), str)
            or not item["titulo"].strip()
            or len(item["titulo"]) > 120
            or not isinstance(item.get("texto"), str)
            or not item["texto"].strip()
            or len(item["texto"]) > 400
            for item in self.puntos
        ):
            errors["puntos"] = "Cada punto requiere título y texto válidos."

        if self.estado in {self.Estado.PENDIENTE, self.Estado.PUBLICADO}:
            for field, value in (
                ("titulo", self.titulo),
                ("resumen", self.resumen),
                ("anfitrion_nombre", self.anfitrion_nombre),
            ):
                if not value.strip():
                    errors[field] = "Este campo es obligatorio para enviar a revisión."
            if self.fecha_evento is None or self.vence_en is None:
                errors["fecha_evento"] = (
                    "La fecha del evento y su vencimiento son obligatorios."
                )
            else:
                if timezone.localtime(self.fecha_evento).date() < timezone.localdate():
                    errors["fecha_evento"] = (
                        "La fecha no puede ser anterior a hoy."
                    )
                if self.vence_en < self.fecha_evento:
                    errors["vence_en"] = (
                        "El vencimiento no puede ser anterior al evento."
                    )
                if self.vence_en - timezone.now() >= timedelta(days=400):
                    errors["vence_en"] = (
                        "El vencimiento debe estar a menos de 400 días."
                    )
            if not self.cuestionario_id:
                errors["cuestionario"] = "Selecciona un cuestionario publicado."
            if not self.horarios:
                errors["horarios"] = (
                    "Agrega al menos un horario e indica su zona horaria."
                )
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.titulo or 'Evento'} · {self.workspace}"
