export interface MetadataTemplate {
  nombre: string;
  formato: string;
  caso_uso: string;
  nicho: string;
  descripcion: string;
  usa_scoring: boolean;
}

export interface TemplateCatalogo {
  id: string;
  metadata: MetadataTemplate;
  configuracion: unknown;
}

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function esMetadataTemplate(value: unknown): value is MetadataTemplate {
  return (
    esRegistro(value) &&
    typeof value.nombre === "string" &&
    typeof value.formato === "string" &&
    typeof value.caso_uso === "string" &&
    typeof value.nicho === "string" &&
    typeof value.descripcion === "string" &&
    typeof value.usa_scoring === "boolean"
  );
}

const archivosTemplates = import.meta.glob<unknown>(
  "../../templates/**/*.json",
  { eager: true, import: "default" },
);

export const catalogoTemplates: TemplateCatalogo[] = Object.entries(
  archivosTemplates,
)
  .filter(([ruta]) => ruta.endsWith(".metadata.json"))
  .map(([rutaMetadata, metadata]) => {
    const rutaConfiguracion = rutaMetadata.replace(
      ".metadata.json",
      ".json",
    );
    const configuracion = archivosTemplates[rutaConfiguracion];

    if (!esMetadataTemplate(metadata)) {
      throw new Error(`Metadata de template inválida: ${rutaMetadata}`);
    }
    if (configuracion === undefined) {
      throw new Error(`No se encontró la configuración de ${rutaMetadata}`);
    }

    return {
      id: rutaConfiguracion,
      metadata,
      configuracion,
    };
  })
  .sort((primero, segundo) =>
    primero.metadata.nombre.localeCompare(segundo.metadata.nombre, "es"),
  );
