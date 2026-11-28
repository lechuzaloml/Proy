import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from funnels.models import Cuestionario, Plantilla, VersionCuestionario
from funnels.motor import validar_cuestionario
from workspaces.services import asegurar_espacio_clearia


EXCLUDED_LIBRARY_IDS = {"demo-registro-evento-pagina-completa"}
REFERENCE_CASES = (
    (
        "ser-empresario",
        "Ser Empresario",
        "Caso de referencia existente.",
        "spec/Ejemplos/ser-empresario-config.json",
    ),
    (
        "merkatics",
        "Merkatics",
        "Caso de referencia existente.",
        "spec/Ejemplos/merkatics-config.json",
    ),
    (
        "caso-nuevo",
        "Caso nuevo",
        "Caso de prueba existente, ficticio.",
        "spec/Ejemplos/caso-nuevo.json",
    ),
)
INITIAL_QUESTIONNAIRE = "templates/assessments/diagnostico-inicial.json"


def _read_json(path):
    try:
        with path.open(encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as exc:
        raise CommandError(f"No se pudo leer el JSON fuente {path.name}.") from exc


def _validate(config, path):
    errors = validar_cuestionario(config)
    if errors:
        raise CommandError(
            f"Configuración inválida en {path.name}:\n- " + "\n- ".join(errors)
        )


class Command(BaseCommand):
    help = "Carga las plantillas y casos de referencia desde el proyecto Proy."

    def handle(self, *args, **options):
        source_root = Path(settings.BASE_DIR).parent
        templates_root = source_root / "templates"
        examples_root = source_root / "spec" / "Ejemplos"
        if not templates_root.is_dir() or not examples_root.is_dir():
            raise CommandError(
                "Se requieren las carpetas Proy/templates y Proy/spec/Ejemplos."
            )

        library = []
        for metadata_path in sorted(templates_root.rglob("*.metadata.json")):
            metadata = _read_json(metadata_path)
            config_path = metadata_path.with_name(
                metadata_path.name.removesuffix(".metadata.json") + ".json"
            )
            config = _read_json(config_path)
            _validate(config, config_path)
            if config.get("id") in EXCLUDED_LIBRARY_IDS:
                continue
            required = (
                "nombre",
                "formato",
                "caso_uso",
                "nicho",
                "descripcion",
                "usa_scoring",
            )
            if any(key not in metadata for key in required):
                raise CommandError(f"Metadata incompleta en {metadata_path.name}.")
            library.append(
                (
                    config["id"],
                    {
                        "nombre": metadata["nombre"],
                        "formato": metadata["formato"],
                        "caso_uso": metadata["caso_uso"],
                        "nicho": metadata["nicho"],
                        "descripcion": metadata["descripcion"],
                        "configuracion": config,
                        "tipo": Plantilla.Tipo.BIBLIOTECA,
                    },
                )
            )
        if len(library) != 8:
            raise CommandError(
                f"Se esperaban 8 plantillas de biblioteca; se encontraron {len(library)}."
            )

        references = []
        for slug, name, description, relative_path in REFERENCE_CASES:
            path = source_root / relative_path
            config = _read_json(path)
            _validate(config, path)
            references.append(
                (
                    slug,
                    {
                        "nombre": name,
                        "formato": "Caso de referencia",
                        "caso_uso": "",
                        "nicho": "",
                        "descripcion": description,
                        "configuracion": config,
                        "tipo": Plantilla.Tipo.REFERENCIA,
                    },
                )
            )
        initial_path = templates_root / "assessments" / "diagnostico-inicial.json"
        initial_config = _read_json(initial_path)
        _validate(initial_config, initial_path)

        with transaction.atomic():
            for slug, values in library + references:
                Plantilla.objects.update_or_create(slug=slug, defaults=values)

            workspace = asegurar_espacio_clearia()
            questionnaire, created = Cuestionario.objects.para(workspace).get_or_create(
                nombre=initial_config["cliente"],
                defaults={
                    "estado": Cuestionario.Estado.PUBLICADO,
                    "configuracion": initial_config,
                    "version_actual": 1,
                },
            )
            versions = VersionCuestionario.objects.para(workspace).filter(
                cuestionario=questionnaire
            )
            current = versions.filter(numero=questionnaire.version_actual).first()
            if created:
                VersionCuestionario.objects.para(workspace).create(
                    cuestionario=questionnaire,
                    numero=1,
                    configuracion=initial_config,
                    publicada=True,
                )
            elif (
                current is None
                or current.configuracion != initial_config
                or not current.publicada
            ):
                latest_number = versions.order_by("-numero").values_list(
                    "numero", flat=True
                ).first()
                next_version = max(questionnaire.version_actual, latest_number or 0)
                if latest_number is not None:
                    next_version += 1
                VersionCuestionario.objects.para(workspace).create(
                    cuestionario=questionnaire,
                    numero=next_version,
                    configuracion=initial_config,
                    publicada=True,
                )
                questionnaire.configuracion = initial_config
                questionnaire.version_actual = next_version
                questionnaire.estado = Cuestionario.Estado.PUBLICADO
                questionnaire.save(
                    update_fields=[
                        "configuracion",
                        "version_actual",
                        "estado",
                        "actualizado",
                    ]
                )
            elif questionnaire.estado != Cuestionario.Estado.PUBLICADO:
                questionnaire.estado = Cuestionario.Estado.PUBLICADO
                questionnaire.save(update_fields=["estado", "actualizado"])

        self.stdout.write(
            self.style.SUCCESS(
                "Plantillas: 8; casos de referencia: 3; diagnóstico inicial: publicado."
            )
        )
