from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from users.models import AdminPlataforma
from workspaces.services import asegurar_espacio_clearia


class Command(BaseCommand):
    help = (
        "Asegura Clear-IA y las membresías de propietario para los "
        "administradores de plataforma."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "correo",
            nargs="?",
            help="Correo de un administrador de plataforma; si se omite, aplica a todos.",
        )

    def handle(self, *args, **options):
        correo = options["correo"]
        admins = None
        if correo:
            correo = correo.strip().lower()
            try:
                validate_email(correo)
            except ValidationError as exc:
                raise CommandError("Indica un correo válido.") from exc
            admin = (
                AdminPlataforma.objects.select_related("usuario")
                .filter(usuario__correo=correo)
                .first()
            )
            if admin is None:
                raise CommandError(
                    "No existe una cuenta de plataforma con ese correo."
                )
            admins = [admin]

        workspace = asegurar_espacio_clearia(admins)
        if admins is None:
            total = AdminPlataforma.objects.count()
        else:
            total = len(admins)
        self.stdout.write(
            self.style.SUCCESS(
                f"Espacio {workspace.slug} asegurado; membresías de propietario "
                f"verificadas: {total}."
            )
        )
