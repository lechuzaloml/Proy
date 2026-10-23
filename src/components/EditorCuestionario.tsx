import { useState } from "react";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";
import {
  agregarOpcion,
  agregarPregunta,
  actualizarReglaScoring,
  actualizarCTAResultado,
  actualizarResultadoFijo,
  actualizarResultadoSegmentado,
  cambiarModoScoring,
  cambiarNombreCuestionario,
  cambiarOpcionPregunta,
  cambiarParticipacionScoring,
  cambiarPuntosEscala,
  cambiarPuntosOpcion,
  cambiarTextoPregunta,
  agregarPreguntaSiNo,
  eliminarOpcion,
  eliminarPregunta,
  type TipoPregunta,
} from "../templates/editarCuestionario";

interface EditorCuestionarioProps {
  id: string;
  nombre: string;
  cuestionario: Cuestionario;
  copiaGuardada: boolean;
  onGuardar: (
    nombre: string,
    cuestionario: Cuestionario,
  ) => void | Promise<void>;
  onPrevisualizar: (nombre: string, cuestionario: Cuestionario) => void;
  onDescartar?: () => void;
  onEliminar?: () => void | Promise<void>;
  publicado?: boolean;
  urlPublica?: string;
  onPublicar?: (nombre: string, cuestionario: Cuestionario) => Promise<string>;
  onDespublicar?: () => Promise<void>;
  desdeCero?: boolean;
}

const TIPOS_PREGUNTA: { tipo: TipoPregunta | "si_no"; nombre: string }[] = [
  { tipo: "opcion_multiple", nombre: "Opción múltiple" },
  { tipo: "si_no", nombre: "Sí o no" },
  { tipo: "escala", nombre: "Escala" },
  { tipo: "abierta", nombre: "Respuesta abierta" },
];

export default function EditorCuestionario({
  id,
  nombre: nombreInicial,
  cuestionario: cuestionarioInicial,
  copiaGuardada,
  onGuardar,
  onPrevisualizar,
  onDescartar,
  onEliminar,
  publicado = false,
  urlPublica,
  onPublicar,
  onDespublicar,
  desdeCero = false,
}: EditorCuestionarioProps) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [cuestionario, setCuestionario] = useState(cuestionarioInicial);
  const [tipoPregunta, setTipoPregunta] =
    useState<TipoPregunta | "si_no">("opcion_multiple");
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  const [enlacePublicado, setEnlacePublicado] = useState(urlPublica ?? "");

  async function cambiarPublicacion(
    accion: "publicar" | "despublicar",
  ) {
    setErrorGuardado("");
    if (
      accion === "publicar" &&
      desdeCero &&
      cuestionario.preguntas.length === 0
    ) {
      setErrorGuardado("Agrega al menos una pregunta antes de publicar.");
      return;
    }
    setGuardando(true);
    try {
      if (accion === "publicar" && onPublicar) {
        setEnlacePublicado(await onPublicar(nombre.trim(), cuestionario));
      } else if (accion === "despublicar" && onDespublicar) {
        await onDespublicar();
        setEnlacePublicado("");
      }
    } catch (error: unknown) {
      setErrorGuardado(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el estado de publicación.",
      );
    } finally {
      setGuardando(false);
    }
  }

  function alternarScoring(activado: boolean) {
    if (
      !activado &&
      cuestionario.usa_scoring &&
      cuestionario.resultado.resultados.length > 1 &&
      !window.confirm(
        "Al desactivar la puntuación, este cuestionario solo puede guardar un resultado fijo. Se conservará el primer resultado por segmento y se descartarán los demás resultados y las reglas de scoring. ¿Continuar?",
      )
    ) {
      return;
    }
    try {
      setCuestionario(cambiarModoScoring(cuestionario, activado));
      setErrores([]);
    } catch (error: unknown) {
      setErrores([
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el modo de puntuación.",
      ]);
    }
  }

  async function validarYContinuar(
    continuar: (
      nombreEditado: string,
      data: Cuestionario,
    ) => void | Promise<void>,
  ) {
    const nombreEditado = nombre.trim();
    const cuestionarioEditado = cambiarNombreCuestionario(
      cuestionario,
      nombreEditado,
      id,
    );
    const validacion = validarCuestionario(cuestionarioEditado);
    if (!nombreEditado) {
      setErrores(["El nombre del cuestionario no puede estar vacío."]);
      return;
    }
    if (!validacion.valido) {
      setErrores(validacion.errores);
      return;
    }
    setErrores([]);
    setErrorGuardado("");
    setGuardando(true);
    try {
      await continuar(nombreEditado, validacion.data);
    } catch (error: unknown) {
      setErrorGuardado(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="custom-editor">
      <header className="custom-editor-header">
        <p className="eyebrow">
          {desdeCero
            ? copiaGuardada
              ? "Cuestionario creado desde cero · cambios guardados en Firestore"
              : "Cuestionario nuevo · se guardará en Firestore al guardar"
            : copiaGuardada
            ? "Copia guardada · los cambios se guardan en Firestore"
            : "Copia nueva · se guardará en Firestore al guardar"}
        </p>
        <h1>
          {desdeCero ? "Crea tu cuestionario" : "Personaliza tu cuestionario"}
        </h1>
        <p>
          {desdeCero
            ? "Los datos de contacto se solicitarán primero. Agrega las preguntas que quieras."
            : "Los cambios se aplican a esta copia, no a la plantilla original."}
        </p>
        <label className="custom-editor-name">
          Nombre del cuestionario
          <input
            maxLength={120}
            onChange={(evento) => setNombre(evento.target.value)}
            required
            value={nombre}
          />
        </label>
        <label className="custom-editor-toggle">
          <input
            className="custom-editor-checkbox"
            checked={cuestionario.usa_scoring}
            onChange={(evento) => alternarScoring(evento.target.checked)}
            type="checkbox"
          />
          Usar puntuación y resultados por segmento
        </label>
        {!cuestionario.usa_scoring && (
          <p>Las respuestas se conservan y se mostrará el resultado fijo, sin calcular puntuaciones ni clasificaciones.</p>
        )}
      </header>

      {errores.length > 0 && (
        <div className="validation-errors" role="alert">
          <p>Corrige el cuestionario antes de guardarlo o previsualizarlo:</p>
          <ul>
            {errores.map((error, indice) => <li key={indice}>{error}</li>)}
          </ul>
        </div>
      )}
      {errorGuardado && (
        <p className="admin-error" role="alert">{errorGuardado}</p>
      )}

      <section aria-label="Preguntas del cuestionario" className="custom-editor-questions">
        {cuestionario.preguntas.length === 0 && (
          <p className="admin-empty">
            Todavía no hay preguntas. Elige un tipo y agrega la primera.
          </p>
        )}
        {cuestionario.preguntas.map((pregunta, indicePregunta) => (
          <article
            className="custom-editor-question"
            key={`${pregunta.id}-${indicePregunta}`}
          >
            <div className="custom-editor-question-heading">
              <h2>Pregunta {indicePregunta + 1} · {pregunta.tipo.replace("_", " ")}</h2>
              <button
                className="secondary-button"
                disabled={cuestionario.preguntas.length <= 1}
                onClick={() => setCuestionario((actual) =>
                  eliminarPregunta(actual, indicePregunta),
                )}
                type="button"
              >
                Eliminar pregunta
              </button>
            </div>
            <label>
              Texto de la pregunta
              <textarea
                maxLength={1000}
                onChange={(evento) => setCuestionario((actual) =>
                  cambiarTextoPregunta(actual, indicePregunta, evento.target.value),
                )}
                value={pregunta.texto}
              />
            </label>

            {pregunta.tipo === "opcion_multiple" && (
              <fieldset className="custom-editor-options">
                <legend>Opciones de respuesta</legend>
                {pregunta.opciones.map((opcion, indiceOpcion) => (
                  <div className="custom-editor-option" key={`${pregunta.id}-${indiceOpcion}`}>
                    <label>
                      Opción {indiceOpcion + 1}
                      <input
                        maxLength={300}
                        onChange={(evento) => setCuestionario((actual) =>
                          cambiarOpcionPregunta(
                            actual,
                            indicePregunta,
                            indiceOpcion,
                            evento.target.value,
                          ),
                        )}
                        value={opcion.texto}
                      />
                    </label>
                    {cuestionario.usa_scoring && (
                      <label>
                        Puntos
                        <input
                          aria-label={`Puntos de la opción ${indiceOpcion + 1} de la pregunta ${indicePregunta + 1}`}
                          onChange={(evento) => {
                            const valor = evento.target.value;
                            const puntos = valor.trim() === ""
                              ? undefined
                              : Number(valor);
                            if (puntos === undefined || Number.isFinite(puntos)) {
                              setCuestionario((actual) => cambiarPuntosOpcion(
                                actual,
                                indicePregunta,
                                indiceOpcion,
                                puntos,
                              ));
                            }
                          }}
                          step="any"
                          type="number"
                          value={opcion.puntos ?? ""}
                        />
                      </label>
                    )}
                    <button
                      aria-label={`Eliminar opción ${indiceOpcion + 1}`}
                      className="secondary-button"
                      disabled={pregunta.opciones.length <= 1}
                      onClick={() => setCuestionario((actual) =>
                        eliminarOpcion(actual, indicePregunta, indiceOpcion),
                      )}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  className="secondary-button"
                  onClick={() => setCuestionario((actual) =>
                    agregarOpcion(actual, indicePregunta),
                  )}
                  type="button"
                >
                  Añadir opción
                </button>
              </fieldset>
            )}

            {cuestionario.usa_scoring && (
              <fieldset>
                <legend>Puntuación de la pregunta</legend>
                <label className="custom-editor-scoring-toggle">
                  <input
                    className="custom-editor-checkbox"
                    checked={pregunta.participa_scoring}
                    disabled={pregunta.tipo === "abierta"}
                    onChange={(evento) => setCuestionario((actual) =>
                      cambiarParticipacionScoring(
                        actual,
                        indicePregunta,
                        evento.target.checked,
                      ),
                    )}
                    type="checkbox"
                  />
                  Incluir en el scoring
                </label>
                {pregunta.tipo === "escala" && (
                  <div>
                    {(() => {
                      const inicio = Math.ceil(pregunta.escala.min);
                      const fin = Math.floor(pregunta.escala.max);
                      const cantidad = fin - inicio + 1;
                      const valores = cantidad > 0 && cantidad <= 30
                        ? Array.from({ length: cantidad }, (_, indice) => inicio + indice)
                        : Object.keys(pregunta.puntos_por_valor ?? {})
                          .map(Number)
                          .sort((a, b) => a - b);
                      return valores.map((valor) => (
                        <label key={valor}>
                          Puntos para el valor {valor}
                          <input
                            aria-label={`Puntos para el valor ${valor} de la pregunta ${indicePregunta + 1}`}
                            onChange={(evento) => {
                              const entrada = evento.target.value;
                              const puntos = entrada.trim() === ""
                                ? undefined
                                : Number(entrada);
                              if (puntos === undefined || Number.isFinite(puntos)) {
                                setCuestionario((actual) => cambiarPuntosEscala(
                                  actual,
                                  indicePregunta,
                                  valor,
                                  puntos,
                                ));
                              }
                            }}
                            step="any"
                            type="number"
                            value={pregunta.puntos_por_valor?.[String(valor)] ?? ""}
                          />
                        </label>
                      ));
                    })()}
                    {pregunta.escala.max - pregunta.escala.min >= 30 && (
                      <p>Para rangos de más de 30 valores se muestran únicamente los valores que ya tienen puntuación.</p>
                    )}
                  </div>
                )}
              </fieldset>
            )}
          </article>
        ))}
      </section>

      <section aria-label="Añadir pregunta" className="custom-editor-add">
        <label>
          Tipo de pregunta
          <select
            onChange={(evento) =>
              setTipoPregunta(evento.target.value as TipoPregunta | "si_no")
            }
            value={tipoPregunta}
          >
            {TIPOS_PREGUNTA.map(({ tipo, nombre: nombreTipo }) => (
              <option key={tipo} value={tipo}>{nombreTipo}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => setCuestionario((actual) =>
            tipoPregunta === "si_no"
              ? agregarPreguntaSiNo(actual, `pregunta-${crypto.randomUUID()}`)
              : agregarPregunta(actual, tipoPregunta, `pregunta-${crypto.randomUUID()}`),
          )}
          type="button"
        >
          Añadir pregunta
        </button>
      </section>

      {cuestionario.usa_scoring ? (
        <>
          <section aria-label="Reglas de puntuación" className="custom-editor-questions">
            <h2>Reglas de puntuación</h2>
            {cuestionario.reglas_scoring.map((regla, indice) => (
              <fieldset className="custom-editor-question" key={`${regla.segmento}-${indice}`}>
                <legend>Rango {indice + 1}</legend>
                <label>
                  Puntaje mínimo
                  <input
                    onChange={(evento) => {
                      const valor = Number(evento.target.value);
                      if (Number.isFinite(valor)) {
                        setCuestionario((actual) => actual.usa_scoring
                          ? actualizarReglaScoring(actual, indice, { puntaje_min: valor })
                          : actual);
                      }
                    }}
                    step="any"
                    type="number"
                    value={regla.puntaje_min}
                  />
                </label>
                <label>
                  Puntaje máximo
                  <input
                    onChange={(evento) => {
                      const valor = Number(evento.target.value);
                      if (Number.isFinite(valor)) {
                        setCuestionario((actual) => actual.usa_scoring
                          ? actualizarReglaScoring(actual, indice, { puntaje_max: valor })
                          : actual);
                      }
                    }}
                    step="any"
                    type="number"
                    value={regla.puntaje_max}
                  />
                </label>
                <label>
                  Segmento
                  <input
                    maxLength={120}
                    onChange={(evento) => setCuestionario((actual) => actual.usa_scoring
                      ? actualizarReglaScoring(actual, indice, { segmento: evento.target.value })
                      : actual)}
                    value={regla.segmento}
                  />
                </label>
              </fieldset>
            ))}
          </section>
          <section aria-label="Resultados por segmento" className="custom-editor-questions">
            <h2>Resultados por segmento</h2>
            {cuestionario.resultado.resultados.map((resultado, indice) => (
              <fieldset className="custom-editor-question" key={`${resultado.segmento}-${indice}`}>
                <legend>{resultado.segmento}</legend>
                <label>
                  Contenido del resultado
                  <textarea
                    maxLength={5000}
                    onChange={(evento) => setCuestionario((actual) => actual.usa_scoring
                      ? actualizarResultadoSegmentado(actual, indice, {
                        contenido: evento.target.value,
                      })
                      : actual)}
                    value={resultado.contenido}
                  />
                </label>
                {resultado.cta && (
                  <>
                    <label>
                      Texto de la llamada a la acción
                      <input
                        maxLength={300}
                        onChange={(evento) => setCuestionario((actual) =>
                          actualizarCTAResultado(actual, indice, "texto", evento.target.value),
                        )}
                        value={resultado.cta.texto}
                      />
                    </label>
                    <label>
                      Acción de la llamada a la acción
                      <input
                        maxLength={500}
                        onChange={(evento) => setCuestionario((actual) =>
                          actualizarCTAResultado(actual, indice, "accion", evento.target.value),
                        )}
                        value={resultado.cta.accion}
                      />
                    </label>
                  </>
                )}
              </fieldset>
            ))}
          </section>
        </>
      ) : (
        <section aria-label="Resultado del cuestionario" className="custom-editor-questions">
          <h2>Resultado fijo</h2>
          <label>
            Contenido del resultado
            <textarea
              maxLength={5000}
              onChange={(evento) => setCuestionario((actual) => actual.usa_scoring
                ? actual
                : actualizarResultadoFijo(actual, { contenido: evento.target.value }))}
              value={cuestionario.resultado.contenido}
            />
          </label>
          {cuestionario.resultado.cta && (
            <>
              <label>
                Texto de la llamada a la acción
                <input
                  maxLength={300}
                  onChange={(evento) => setCuestionario((actual) =>
                    actualizarCTAResultado(actual, null, "texto", evento.target.value),
                  )}
                  value={cuestionario.resultado.cta.texto}
                />
              </label>
              <label>
                Acción de la llamada a la acción
                <input
                  maxLength={500}
                  onChange={(evento) => setCuestionario((actual) =>
                    actualizarCTAResultado(actual, null, "accion", evento.target.value),
                  )}
                  value={cuestionario.resultado.cta.accion}
                />
              </label>
            </>
          )}
        </section>
      )}

      <footer className="custom-editor-actions">
        <button
          className="secondary-button"
          disabled={guardando}
          onClick={() => void validarYContinuar(
            (nombreEditado, data) => onGuardar(nombreEditado, data),
          )
          }
          type="button"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {!copiaGuardada && onDescartar && (
          <button
            className="secondary-button"
            disabled={guardando}
            onClick={onDescartar}
            type="button"
          >
            Descartar
          </button>
        )}
        {copiaGuardada && onEliminar && (
          <button
            className="secondary-button"
            disabled={guardando}
            onClick={() => {
              setErrorGuardado("");
              setGuardando(true);
              void Promise.resolve(onEliminar())
                .catch((error: unknown) => {
                  setErrorGuardado(
                    error instanceof Error
                      ? error.message
                      : "No se pudo eliminar la copia.",
                  );
                })
                .finally(() => setGuardando(false));
            }}
            type="button"
          >
            Eliminar
          </button>
        )}
        {copiaGuardada && onPublicar && (
          <button
            className="secondary-button"
            disabled={guardando}
            onClick={() => void validarYContinuar(async (nombreEditado, data) => {
              setEnlacePublicado(await onPublicar(nombreEditado, data));
            })}
            type="button"
          >
            {publicado ? "Publicar cambios" : "Publicar"}
          </button>
        )}
        {copiaGuardada && publicado && onDespublicar && (
          <button
            className="secondary-button"
            disabled={guardando}
            onClick={() => void cambiarPublicacion("despublicar")}
            type="button"
          >
            Despublicar
          </button>
        )}
        <button
          className="submit-button"
          disabled={guardando}
          onClick={() => void validarYContinuar(
            (nombreEditado, data) =>
              onPrevisualizar(nombreEditado, data),
          )
          }
          type="button"
        >
          Previsualizar cuestionario
        </button>
      </footer>
      {enlacePublicado && (
        <p className="published-questionnaire-link">
          URL pública: <a href={enlacePublicado}>{enlacePublicado}</a>
        </p>
      )}
    </main>
  );
}
