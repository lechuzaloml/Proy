import type { ReactNode } from "react";
import TarjetaTemplate from "./TarjetaTemplate";
import type { TemplateCatalogo } from "../templates/catalogo";
import { tienePortadaTemplate } from "./PantallaInicioTemplate";
import type { DocumentoCuestionarioGuardado } from "../lib/documentoCuestionario";
import { useScrollReveal } from "../hooks/useScrollReveal";

export interface CasoReferencia {
  id: string;
  nombre: string;
  descripcion: string;
  configuracion: unknown;
}

interface BibliotecaTemplatesProps {
  templates: TemplateCatalogo[];
  casosReferencia: CasoReferencia[];
  copiasGuardadas: DocumentoCuestionarioGuardado[];
  cargandoCopias: boolean;
  errorBiblioteca: string;
  accesoCuenta: ReactNode;
  onCrearCopia?: (nombre: string, configuracion: unknown) => void | Promise<void>;
  onCrearDesdeCero?: () => void | Promise<void>;
  onAbrirCopia: (id: string) => void | Promise<void>;
  onEliminarCopia?: (id: string) => void | Promise<void>;
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
  copiasGuardadas,
  cargandoCopias,
  errorBiblioteca,
  accesoCuenta,
  onCrearCopia,
  onCrearDesdeCero,
  onAbrirCopia,
  onEliminarCopia,
  onSeleccionar,
}: BibliotecaTemplatesProps) {
  const savedQuestionnairesReveal = useScrollReveal<HTMLElement>({
    staggerChildren: true,
  });
  const templateGridReveal = useScrollReveal<HTMLDivElement>({
    staggerChildren: true,
  });
  const referenceListReveal = useScrollReveal<HTMLDivElement>({
    staggerChildren: true,
  });

  return (
    <main className="template-library">
      <header className="library-header">
        <p className="eyebrow">Clear-IA</p>
        {accesoCuenta}
        <h1>Biblioteca de templates</h1>
        <p>
        Elige una plantilla como punto de partida para crear tu propio
        cuestionario y adaptar sus preguntas, puntuación y resultados.
        </p>
      </header>

      {errorBiblioteca && (
        <p className="admin-error" role="alert">{errorBiblioteca}</p>
      )}

      {onCrearCopia && (
        <section
          aria-labelledby="saved-questionnaires-heading"
          ref={savedQuestionnairesReveal}
        >
          {onCrearDesdeCero && (
            <div className="create-questionnaire-from-scratch">
              <h2>Crear un cuestionario desde cero</h2>
              <p>
                Empieza con los datos de contacto y agrega tus propias
                preguntas, sin usar una plantilla.
              </p>
              <button
                className="submit-button"
                onClick={() => void onCrearDesdeCero()}
                type="button"
              >
                Crear desde cero
              </button>
            </div>
          )}
          <h2 id="saved-questionnaires-heading">Mis copias guardadas</h2>
          {cargandoCopias ? (
            <div aria-busy="true" className="saved-questionnaire-loading">
              <p className="sr-only" role="status">Cargando copias guardadas…</p>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </div>
          ) : copiasGuardadas.length === 0 ? (
            <p>Aún no tienes copias guardadas.</p>
          ) : (
            <ul className="saved-questionnaire-list">
              {copiasGuardadas.map((copia) => (
                <li key={copia.id}>
                  <span>{copia.nombre}</span>
                  <button
                    className="secondary-button"
                    onClick={() => void onAbrirCopia(copia.id)}
                    type="button"
                  >
                    Abrir y editar
                  </button>
                  {onEliminarCopia && (
                    <button
                      className="secondary-button"
                      onClick={() => void onEliminarCopia(copia.id)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading">Templates demostrativos</h2>
        <div className="template-grid" ref={templateGridReveal}>
          {templates.map((template) => (
            <TarjetaTemplate
              key={template.id}
              metadata={template.metadata}
              onProbar={() =>
                onSeleccionar(
                  template.id,
                  template.metadata.nombre,
                  template.configuracion,
                  tienePortadaTemplate(template.id) ? "biblioteca" : undefined,
                )
              }
              onCrearCopia={
                onCrearCopia
                  ? () =>
                    onCrearCopia(
                      template.metadata.nombre,
                      template.configuracion,
                    )
                  : undefined
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
        <div className="reference-list" ref={referenceListReveal}>
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
