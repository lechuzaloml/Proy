import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection
from django.db.migrations.executor import MigrationExecutor


REQUIRED_ENVIRONMENT_VARIABLES = (
    "SECRET_KEY",
    "MYSQL_NAME",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
    "MYSQL_HOST",
    "MYSQL_PORT",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_ID",
    "STRIPE_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    "CRON_SECRET",
)


class Command(BaseCommand):
    help = "Comprueba variables, MySQL, migraciones, Stripe Sandbox y estáticos."

    def handle(self, *args, **options):
        errors = []
        missing = [
            name
            for name in REQUIRED_ENVIRONMENT_VARIABLES
            if not os.getenv(name, "").strip()
        ]
        if missing:
            errors.append(
                "Faltan variables obligatorias: " + ", ".join(missing)
            )
        else:
            self.stdout.write("Variables obligatorias: configuradas.")

        if settings.DEBUG:
            errors.append("DEBUG debe ser False en el entorno de demostración.")
        if not settings.CSRF_TRUSTED_ORIGINS or not all(
            origin.startswith("https://")
            for origin in settings.CSRF_TRUSTED_ORIGINS
        ):
            errors.append(
                "CSRF_TRUSTED_ORIGINS debe contener orígenes HTTPS en producción."
            )

        if not settings.STRIPE_SECRET_KEY.startswith("sk_test_"):
            errors.append("Stripe debe usar una clave sandbox sk_test_.")
        elif not settings.STRIPE_WEBHOOK_SECRET.startswith("whsec_"):
            errors.append("STRIPE_WEBHOOK_SECRET no tiene formato válido.")
        else:
            self.stdout.write("Stripe Sandbox: configurado.")

        if connection.vendor != "mysql":
            errors.append("La base configurada no es MySQL.")
        else:
            try:
                connection.ensure_connection()
                with connection.cursor() as cursor:
                    cursor.execute("SELECT @@character_set_database, @@sql_mode")
                    charset, sql_mode = cursor.fetchone()
                if charset.lower() != "utf8mb4":
                    errors.append("La base debe usar el charset utf8mb4.")
                else:
                    self.stdout.write("Charset MySQL: utf8mb4.")
                modes = {mode.strip().upper() for mode in sql_mode.split(",")}
                if not modes.intersection({"STRICT_TRANS_TABLES", "STRICT_ALL_TABLES"}):
                    errors.append("MySQL debe tener strict mode habilitado.")
                else:
                    self.stdout.write("Modo estricto de MySQL: activo.")
                if settings.DATABASES["default"]["CONN_MAX_AGE"] != 0:
                    errors.append("CONN_MAX_AGE debe ser 0.")
                executor = MigrationExecutor(connection)
                pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
                if pending:
                    errors.append("Hay migraciones pendientes.")
                else:
                    self.stdout.write("Migraciones: aplicadas.")
            except DatabaseError as error:
                errors.append(
                    f"No se pudo validar la conexión o el esquema MySQL: "
                    f"{error.__class__.__name__}."
                )

        manifest = Path(settings.STATIC_ROOT) / "staticfiles.json"
        if manifest.is_file():
            self.stdout.write("Estáticos recopilados: manifest disponible.")
        else:
            errors.append(
                "No se encontró staticfiles.json; ejecuta collectstatic --noinput."
            )

        if errors:
            for error in errors:
                self.stderr.write(self.style.ERROR(f"ERROR: {error}"))
            raise CommandError("El entorno no cumple todas las comprobaciones.")
        self.stdout.write(self.style.SUCCESS("Entorno verificado correctamente."))
