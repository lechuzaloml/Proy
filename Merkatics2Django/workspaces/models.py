import re
import uuid

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator, URLValidator
from django.db import models

from core.models import WorkspaceScopedModel
from workspaces.constants import PROTECTED_WORKSPACE_SLUGS
from users.models import Usuario


RESERVED_SLUGS = {
    "admin",
    "e",
    "c",
    "api",
    "assets",
    "static",
    "login",
    "plataforma",
}
RESERVED_SLUGS.update(PROTECTED_WORKSPACE_SLUGS)
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$")


def validate_workspace_slug(value):
    if not SLUG_PATTERN.fullmatch(value):
        raise ValidationError(
            "Usa de 3 a 40 caracteres: minúsculas, números y guiones internos."
        )
    if value in RESERVED_SLUGS:
        raise ValidationError("Este slug está reservado.")


class Workspace(models.Model):
    class Estado(models.TextChoices):
        ACTIVA = "activa", "Activa"
        SUSPENDIDA = "suspendida", "Suspendida"

    class Plan(models.TextChoices):
        INICIAL = "inicial", "Inicial"
        PRO = "pro", "Pro"
        AVANZADO = "avanzado", "Avanzado"
        INTERNO = "interno", "Interno"

    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    slug = models.SlugField(
        max_length=40, unique=True, validators=[validate_workspace_slug]
    )
    nombre = models.CharField(max_length=150)
    estado = models.CharField(
        max_length=12, choices=Estado.choices, default=Estado.ACTIVA
    )
    plan = models.CharField(
        max_length=10, choices=Plan.choices, default=Plan.INICIAL
    )
    color_primario = models.CharField(
        max_length=7,
        default="#E2554F",
        validators=[
            RegexValidator(
                regex=r"^#[0-9A-Fa-f]{6}$",
                message="Usa un color hexadecimal con formato #RRGGBB.",
            )
        ],
    )
    logo_url = models.URLField(
        max_length=2048,
        blank=True,
        validators=[URLValidator(schemes=["https"])],
    )
    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre


class Membresia(WorkspaceScopedModel):
    class Rol(models.TextChoices):
        PROPIETARIO = "propietario", "Propietario"
        ADMIN = "admin", "Admin"
        USUARIO = "usuario", "Usuario"

    class Estado(models.TextChoices):
        ACTIVO = "activo", "Activo"
        INACTIVO = "inactivo", "Inactivo"

    correo = models.EmailField(max_length=191)
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="membresias",
    )
    rol = models.CharField(max_length=12, choices=Rol.choices, default=Rol.USUARIO)
    ver_leads = models.BooleanField(default=False)
    gestionar_leads = models.BooleanField(default=False)
    editar_cuestionarios = models.BooleanField(default=False)
    publicar_cuestionarios = models.BooleanField(default=False)
    estado = models.CharField(
        max_length=8, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "correo"], name="uniq_workspace_membership_email"
            )
        ]
        ordering = ["correo"]

    def save(self, *args, **kwargs):
        self.correo = self.correo.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.correo} ({self.workspace})"


class WorkspaceEliminacion(models.Model):
    slug = models.SlugField(max_length=40)
    stripe_subscription_id = models.CharField(
        max_length=191,
        null=True,
        blank=True,
        unique=True,
    )
    creada = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.slug} · {self.stripe_subscription_id or 'sin Stripe'}"
