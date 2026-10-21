import TarjetaTemplate from "./TarjetaTemplate";
import type { TemplateCatalogo } from "../templates/catalogo";

export interface CasoReferencia {
  id: string;
  nombre: string;
  descripcion: string;
  configuracion: unknown;
}

interface BibliotecaTemplatesProps {
  templates: TemplateCatalogo[];
  casosReferencia: CasoReferencia[];
  onCrearCopia: (nombre: string, configuracion: unknown) => void;
  onSeleccionar: (
    id: string,
    nombre: string,
    configuracion: unknown,
    origenIntroduccionTemplate?: "biblioteca" | "recomendacion",
  ) => void;
}

export default function BibliotecaTemplates({
  templates,
  casosReferencia,
  onCrearCopia,
  onSeleccionar,
}: BibliotecaTemplatesProps) {
  return (
    <main className="template-library">
      <header className="library-header">
        <p className="eyebrow">Clear-IA</p>
        <h1>Biblioteca de templates</h1>
        <p>
        Elige una plantilla como punto de partida para crear tu propio
        cuestionario y adaptar sus preguntas, puntuación y resultados.
        </p>
      </header>

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading">Templates demostrativos</h2>
        <div className="template-grid">
          {templates.map((template) => (
            <TarjetaTemplate
              key={template.id}
              metadata={template.metadata}
              onSeleccionar={() =>
                onCrearCopia(
                  template.metadata.nombre,
                  template.configuracion,
                )
              }
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="references-heading"
        className="reference-cases"
      >
        <h2 id="references-heading">Casos de referencia</h2>
        <p>
          Ejemplos existentes del proyecto; no forman parte de los templates
          ficticios.
        </p>
        <div className="reference-list">
          {casosReferencia.map((caso) => (
            <article className="reference-card" key={caso.id}>
              <div>
                <h3>{caso.nombre}</h3>
                <p>{caso.descripcion}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  onSeleccionar(
                    caso.id,
                    caso.nombre,
                    caso.configuracion,
                  )
                }
                type="button"
              >
                Abrir caso
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
