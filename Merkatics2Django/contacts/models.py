import uuid

from django.core.validators import MaxLengthValidator
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models import WorkspaceScopedModel


class Contacto(WorkspaceScopedModel):
    class Estado(models.TextChoices):
        NUEVO = "nuevo", "Nuevo"
        CONTACTADO = "contactado", "Contactado"
        INTERESADO = "interesado", "Interesado"
        CONVERTIDO = "convertido", "Convertido"
        DESCARTADO = "descartado", "Descartado"

    attempt_id = models.UUIDField(default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=120)
    correo = models.EmailField(max_length=200)
    telefono = models.CharField(max_length=30)
    consentimiento_version = models.CharField(max_length=40)
    consentimiento_fecha = models.DateTimeField()
    origen = models.CharField(max_length=80)
    estado = models.CharField(
        max_length=12, choices=Estado.choices, default=Estado.NUEVO
    )
    asignado_a = models.ForeignKey(
        "users.Usuario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contactos_asignados",
    )
    contactado_en = models.DateTimeField(null=True, blank=True)
    ultima_actividad = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-creado"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "attempt_id"],
                name="uniq_workspace_submission_attempt",
            )
        ]

    def save(self, *args, **kwargs):
        self.correo = self.correo.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre} ({self.correo})"


class Diagnostico(WorkspaceScopedModel):
    contacto = models.ForeignKey(
        Contacto,
        on_delete=models.CASCADE,
        related_name="diagnosticos",
    )
    cuestionario = models.ForeignKey(
        "funnels.Cuestionario",
        on_delete=models.PROTECT,
        related_name="diagnosticos",
    )
    version = models.PositiveIntegerField()
    respuestas = models.JSONField()
    puntaje_total = models.PositiveIntegerField()
    puntaje_maximo = models.PositiveIntegerField()
    porcentaje = models.PositiveSmallIntegerField()
    segmento = models.CharField(max_length=100, blank=True)
    puntaje_por_dimension = models.JSONField(default=dict)
    resultado = models.JSONField()

    class Meta:
        ordering = ["-creado"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "contacto"],
                name="uniq_workspace_diagnosis_contact",
            )
        ]

    def clean(self):
        if self.workspace_id and self.contacto_id:
            if not Contacto.objects.para(self.workspace).filter(
                pk=self.contacto_id
            ).exists():
                raise ValidationError(
                    {"contacto": "El contacto debe pertenecer al mismo workspace."}
                )
        if self.workspace_id and self.cuestionario_id:
            from funnels.models import Cuestionario

            if not Cuestionario.objects.para(self.workspace).filter(
                pk=self.cuestionario_id
            ).exists():
                raise ValidationError(
                    {
                        "cuestionario": (
                            "El cuestionario debe pertenecer al mismo workspace."
                        )
                    }
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Diagnóstico de {self.contacto}"


class Seguimiento(WorkspaceScopedModel):
    class Tipo(models.TextChoices):
        LLAMADA = "llamada", "Llamada"
        WHATSAPP = "whatsapp", "WhatsApp"
        CORREO = "correo", "Correo"
        NOTA = "nota", "Nota"

    contacto = models.ForeignKey(
        Contacto,
        on_delete=models.CASCADE,
        related_name="seguimientos",
    )
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    notas = models.TextField(validators=[MaxLengthValidator(2000)])
    resultado = models.CharField(max_length=200, blank=True)
    proxima_accion = models.CharField(max_length=200, blank=True)
    creado_por = models.ForeignKey(
        "users.Usuario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="seguimientos_creados",
    )

    class Meta:
        ordering = ["-creado"]

    def clean(self):
        if self.workspace_id and self.contacto_id and not Contacto.objects.para(
            self.workspace
        ).filter(pk=self.contacto_id).exists():
            raise ValidationError(
                {"contacto": "El contacto debe pertenecer al mismo workspace."}
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_tipo_display()} · {self.contacto}"


class LimiteEnviosIP(models.Model):
    ip_hash = models.CharField(max_length=64, unique=True)
    inicio_ventana = models.DateTimeField()
    cantidad = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return self.ip_hash
