from decimal import Decimal

from django.db import models
from django.utils import timezone

from core.models import WorkspaceScopedManager


class SuscripcionWorkspace(models.Model):
    class Estado(models.TextChoices):
        PRUEBA = "prueba", "Prueba"
        ACTIVA = "activa", "Activa"
        PAGO_PENDIENTE = "pago_pendiente", "Pago pendiente"
        CANCELADA = "cancelada", "Cancelada"

    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.PROTECT,
        related_name="suscripcion",
    )
    estado = models.CharField(
        max_length=16,
        choices=Estado.choices,
        default=Estado.PRUEBA,
    )
    prueba_hasta = models.DateTimeField()
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    stripe_subscription_id = models.CharField(max_length=191, unique=True)
    precio = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        default=Decimal("1.00"),
    )
    actualizado = models.DateTimeField(auto_now=True)

    objects = WorkspaceScopedManager()

    class Meta:
        verbose_name = "suscripción de empresa"
        verbose_name_plural = "suscripciones de empresas"

    def __str__(self):
        return f"{self.workspace}: {self.get_estado_display()}"


class PruebaUsada(models.Model):
    correo = models.EmailField(max_length=191, unique=True)
    slug = models.SlugField(max_length=40)
    creada = models.DateTimeField(default=timezone.now, editable=False)

    def save(self, *args, **kwargs):
        self.correo = self.correo.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.correo} · {self.slug}"


class EventoStripe(models.Model):
    stripe_event_id = models.CharField(max_length=191, unique=True)
    tipo = models.CharField(max_length=100)
    procesado = models.BooleanField(default=False)
    error = models.CharField(max_length=300, blank=True)
    recibido = models.DateTimeField(default=timezone.now, editable=False)

    def __str__(self):
        return self.stripe_event_id
