import re
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand


def _column_type(field):
    field_type = field.get_internal_type()
    if getattr(field, "max_length", None):
        return f"{field_type}({field.max_length})"
    if getattr(field, "max_digits", None):
        return f"{field_type}({field.max_digits}, {field.decimal_places})"
    return field_type


def _relation(field):
    if not field.is_relation or field.remote_field is None:
        return ""
    related = field.remote_field.model
    on_delete = getattr(field.remote_field.on_delete, "__name__", "CASCADE")
    return f"{related._meta.db_table}.{field.target_field.column} ({on_delete})"


def _index_description(index):
    fields = ", ".join(index.fields) or ", ".join(
        str(expression) for expression in index.expressions
    )
    return f"`{index.name}`: {fields}"


def _constraint_description(constraint):
    fields = ", ".join(getattr(constraint, "fields", ()) or ())
    if not fields:
        fields = str(getattr(constraint, "condition", "") or "")
    kind = type(constraint).__name__
    return f"`{constraint.name}` ({kind}): {fields or 'expresión definida en el modelo'}"


def render_dictionary():
    models = sorted(
        (
            model
            for model in apps.get_models(include_auto_created=True)
            if model._meta.managed and not model._meta.proxy
        ),
        key=lambda model: model._meta.db_table,
    )
    tables = {model._meta.db_table: model for model in models}
    lines = [
        "# Diccionario de la base de datos",
        "",
        "Documento generado desde los modelos Django con "
        "`python manage.py generar_diccionario`.",
        "Describe estructura, no contiene filas ni datos personales.",
        "",
        "## Creación y puesta en marcha",
        "",
        "1. En un servidor propio, crea la base y un usuario dedicado con "
        "privilegios limitados a ella. Ejemplo para MySQL 8:",
        "",
        "   ```sql",
        "   CREATE DATABASE <nombre> CHARACTER SET utf8mb4 "
        "COLLATE utf8mb4_unicode_ci;",
        "   CREATE USER '<usuario>'@'<host>' IDENTIFIED BY '<contraseña>';",
        "   GRANT ALL PRIVILEGES ON <nombre>.* TO '<usuario>'@'<host>';",
        "   ```",
        "",
        "   En una base alojada, crea la base y el usuario desde el panel del "
        "proveedor; copia su host, puerto y certificado CA TLS.",
        "2. Configura `MYSQL_NAME`, `MYSQL_USER`, `MYSQL_PASSWORD`, "
        "`MYSQL_HOST`, `MYSQL_PORT`; para TLS usa `MYSQL_SSL_CA` o "
        "`MYSQL_SSL=True`.",
        "3. Configura los demás secretos únicamente en el entorno de ejecución; "
        "no los guardes en el repositorio.",
        "4. Ejecuta en este orden: `migrate`, `cargar_plantillas`, "
        "`crear_admin_plataforma <correo>` y `asegurar_espacio_clearia`.",
        "5. Para respaldo sin filas personales: "
        "`mysqldump --no-data --routines --triggers <base> > estructura.sql` "
        "y `mysqldump --no-create-info <base> django_migrations > migraciones.sql`.",
        "6. Restaura primero `mysql <base> < estructura.sql` y después "
        "`mysql <base> < migraciones.sql`. La segunda tabla contiene solo "
        "metadatos de migración, no datos de usuarios; conserva la versión "
        "de esquema. Finalmente ejecuta `migrate` para aplicar migraciones "
        "posteriores.",
        "7. Si solo quieres iniciar una instancia vacía, configura una base "
        "nueva sin restaurar el DDL y ejecuta `migrate` para que Django cree "
        "el esquema; no ejecutes migraciones sobre tablas ya existentes sin "
        "restaurar también su historial.",
        "",
        "La misma configuración funciona en un servidor propio o en una base "
        "alojada; usa el host, puerto y certificado TLS que proporcione el "
        "proveedor. Los datos reales no se incluyen en el repositorio.",
        "",
        "## Diagrama de entidades",
        "",
        "```mermaid",
        "erDiagram",
    ]

    for table, model in tables.items():
        safe_table = re.sub(r"[^A-Za-z0-9_]", "_", table)
        lines.append(f"    {safe_table} {{")
        for field in model._meta.local_fields:
            if field.is_relation and field.many_to_one:
                field_type = "FK"
            elif field.is_relation and field.one_to_one:
                field_type = "OneToOneField"
            else:
                field_type = field.get_internal_type()
            lines.append(f"        {field_type} {field.column}")
        lines.append("    }")

    for table, model in tables.items():
        source_table = re.sub(r"[^A-Za-z0-9_]", "_", table)
        for field in model._meta.local_fields:
            if field.is_relation and field.remote_field:
                target_table = field.remote_field.model._meta.db_table
                if target_table not in tables:
                    continue
                safe_target = re.sub(r"[^A-Za-z0-9_]", "_", target_table)
                cardinality = "||--||" if field.one_to_one else "||--o{"
                lines.append(
                    f'    {safe_target} {cardinality} {source_table} : '
                    f'"{field.column}"'
                )
    lines.extend(["```", ""])

    for table, model in tables.items():
        lines.extend(
            [
                f"## `{table}` — `{model._meta.label}`",
                "",
                "| Campo | Tipo | Nulo | Único | PK | Índice | Relación |",
                "|---|---|---:|---:|---:|---:|---|",
            ]
        )
        for field in model._meta.local_fields:
            relation = _relation(field).replace("|", "\\|")
            lines.append(
                f"| `{field.column}` | `{_column_type(field)}` | "
                f"{'Sí' if field.null else 'No'} | "
                f"{'Sí' if field.unique else 'No'} | "
                f"{'Sí' if field.primary_key else 'No'} | "
                f"{'Sí' if field.db_index else 'No'} | {relation or '—'} |"
            )
        indexes = [_index_description(index) for index in model._meta.indexes]
        constraints = [
            _constraint_description(item) for item in model._meta.constraints
        ]
        unique_together = model._meta.unique_together
        for fields in unique_together:
            constraints.append(f"Único conjunto: {', '.join(fields)}")
        lines.extend(["", "Índices y restricciones:", ""])
        if indexes or constraints:
            lines.extend(f"- {item}" for item in (*indexes, *constraints))
        else:
            lines.append("- Ninguno declarado.")
        lines.append("")

    return "\n".join(lines)


class Command(BaseCommand):
    help = "Genera docs/base-de-datos.md desde los modelos Django."

    def handle(self, *args, **options):
        output = Path(settings.BASE_DIR) / "docs" / "base-de-datos.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_dictionary(), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Diccionario generado: {output}"))
