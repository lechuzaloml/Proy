from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from users.models import AdminPlataforma, Usuario
from workspaces.services import asegurar_espacio_clearia


class Command(BaseCommand):
    help = "Crea un administrador de plataforma para el correo indicado."

    def add_arguments(self, parser):
        parser.add_argument("correo")

    def handle(self, *args, **options):
        correo = options["correo"].strip().lower()
        try:
            validate_email(correo)
        except ValidationError as exc:
            raise CommandError("Indica un correo válido.") from exc
        if len(correo) > 191:
            raise CommandError("El correo no puede superar 191 caracteres.")

        with transaction.atomic():
            usuario, _ = Usuario.objects.get_or_create(
                correo=correo,
                defaults={"nombre": correo},
            )
            if not usuario.activo:
                raise CommandError(
                    "La cuenta está desactivada; reactívala antes de asignar el rol."
                )
            admin, created = AdminPlataforma.objects.get_or_create(usuario=usuario)
            asegurar_espacio_clearia([admin])
        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Administrador creado para {correo} con acceso a Clear-IA."
                )
            )
        else:
            self.stdout.write(
                f"{correo} ya era administrador; se aseguró su acceso a Clear-IA."
            )
