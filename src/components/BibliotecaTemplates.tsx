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
  puedeEditarCopia: (copia: DocumentoCuestionarioGuardado) => boolean;
  puedeBorrarCopia: (copia: DocumentoCuestionarioGuardado) => boolean;
  onEliminarCopia?: (id: string) => void | Promise<void>;
  puedePublicar: boolean;
  onPublicarCopia?: (id: string) => void | Promise<void>;
  onDespublicarCopia?: (id: string) => void | Promise<void>;
  usoCuestionarios?: {
    usados: number;
    limite: number;
    cargando: boolean;
    error: string;
  };
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
  puedeEditarCopia,
  puedeBorrarCopia,
  onEliminarCopia,
  puedePublicar,
  onPublicarCopia,
  onDespublicarCopia,
  usoCuestionarios,
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
  const alcanzoLimite = Boolean(
    usoCuestionarios &&
      usoCuestionarios.usados >= usoCuestionarios.limite,
  );
  const puedePublicarAhora = puedePublicar &&
    !usoCuestionarios?.cargando &&
    !usoCuestionarios?.error &&
    !alcanzoLimite;

  return (
    <main className="template-library">
      <header className="library-brand">
        <div className="library-brand-identity">
          <img
            alt=""
            aria-hidden="true"
            className="landing-brand-mark"
            src="/merkatic-brand-mark.png"
          />
          <span>CLEAR-IA</span>
        </div>
        <div className="library-account">{accesoCuenta}</div>
      </header>
      <header className="library-header">
        <p className="eyebrow">Clear-IA</p>
        <h1>Biblioteca de templates</h1>
        <p>
        Elige una plantilla como punto de partida para crear tu propio
        cuestionario y adaptar sus preguntas, puntuación y resultados.
        </p>
        {usoCuestionarios && (
          <p aria-live="polite">
            Cuestionarios publicados:{" "}
            {usoCuestionarios.cargando
              ? "cargando"
              : `${usoCuestionarios.usados} de ${
                Number.isFinite(usoCuestionarios.limite)
                  ? usoCuestionarios.limite
                  : "sin límite"
              }`}
          </p>
        )}
        {usoCuestionarios?.error && (
          <p className="admin-error" role="alert">{usoCuestionarios.error}</p>
        )}
        {puedePublicar && alcanzoLimite && (
          <p role="status">
            Alcanzaste el límite de tu plan: despublica uno o cambia de plan.
          </p>
        )}
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
                  <div>
                    <strong>{copia.nombre}</strong>
                    <small>Creado por {copia.creadoPor}</small>
                  </div>
                  {puedeEditarCopia(copia) && (
                    <button
                      className="secondary-button"
                      onClick={() => void onAbrirCopia(copia.id)}
                      type="button"
                    >
                      Abrir y editar
                    </button>
                  )}
                  {copia.estado === "publicado" ? (
                    <span>Despublica primero</span>
                  ) : (
                    onEliminarCopia && puedeBorrarCopia(copia) && (
                      <button
                        className="secondary-button"
                        onClick={() => void onEliminarCopia(copia.id)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    )
                  )}
                  {puedePublicar && copia.estado === "borrador" &&
                    onPublicarCopia && (
                      <button
                        className="secondary-button"
                        disabled={!puedePublicarAhora}
                        onClick={() => void onPublicarCopia(copia.id)}
                        type="button"
                      >
                        Publicar
                      </button>
                    )}
                  {puedePublicar && copia.estado === "borrador" &&
                    !puedePublicarAhora && !alcanzoLimite && (
                      <small>
                        {usoCuestionarios?.error
                          ? "No se pudo comprobar el cupo para publicar."
                          : "Consultando el cupo de publicación…"}
                      </small>
                    )}
                  {puedePublicar && copia.estado === "publicado" &&
                    onDespublicarCopia && (
                      <button
                        className="secondary-button"
                        onClick={() => void onDespublicarCopia(copia.id)}
                        type="button"
                      >
                        Despublicar
                      </button>
                    )}
                  {!puedePublicar && (
                    <small>Pide la publicación a un administrador.</small>
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
