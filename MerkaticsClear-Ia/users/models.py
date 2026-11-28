import uuid

from django.core.validators import URLValidator
from django.db import models


https_url_validator = URLValidator(schemes=["https"])


class Usuario(models.Model):
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    correo = models.EmailField(unique=True, max_length=191)
    nombre = models.CharField(max_length=150, blank=True)
    foto_url = models.URLField(blank=True, validators=[https_url_validator])
    activo = models.BooleanField(default=True)
    creado = models.DateTimeField(auto_now_add=True)
    ultimo_acceso = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.correo = self.correo.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.correo


class AdminPlataforma(models.Model):
    usuario = models.OneToOneField(
        Usuario, on_delete=models.CASCADE, related_name="admin_plataforma"
    )
    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.usuario.correo


class IntentoAcceso(models.Model):
    ip_hash = models.CharField(max_length=64, unique=True)
    inicio_ventana = models.DateTimeField()
    cantidad = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return self.ip_hash
