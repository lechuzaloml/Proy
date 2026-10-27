import { useEffect, useState } from "react";
import type { Cuestionario } from "../types/model";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { obtenerPresentacionTemplate } from "../config/presentacionTemplates";
import { TEXTO_AVISO_PRIVACIDAD } from "../config/privacidad";
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

function etiquetaTipoPregunta(tipo: TipoPregunta): string {
  switch (tipo) {
    case "opcion_multiple":
      return "Opción múltiple";
    case "escala":
      return "Escala";
    case "abierta":
      return "Respuesta abierta";
  }
}

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
  const contactReveal = useScrollReveal<HTMLElement>();
  const questionsReveal = useScrollReveal<HTMLElement>({
    staggerChildren: true,
  });
  const scoringReveal = useScrollReveal<HTMLElement>({
    staggerChildren: true,
  });
  const segmentsReveal = useScrollReveal<HTMLElement>({
    staggerChildren: true,
  });
  const fixedResultReveal = useScrollReveal<HTMLElement>();
  const previewReveal = useScrollReveal<HTMLElement>();
  const [nombre, setNombre] = useState(nombreInicial);
  const [cuestionario, setCuestionario] = useState(cuestionarioInicial);
  const [tipoPregunta, setTipoPregunta] =
    useState<TipoPregunta | "si_no">("opcion_multiple");
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  const [mensajeAccion, setMensajeAccion] = useState("");
  const [enlacePublicado, setEnlacePublicado] = useState(urlPublica ?? "");
  const [indiceVistaPrevia, setIndiceVistaPrevia] = useState(0);
  useEffect(() => {
    if (!mensajeAccion) {
      return;
    }
    const timeout = window.setTimeout(() => setMensajeAccion(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [mensajeAccion]);

  const indiceVistaPreviaNormalizado = Math.max(
    0,
    Math.min(indiceVistaPrevia, cuestionario.preguntas.length - 1),
  );
  const preguntaVistaPrevia = cuestionario.preguntas[
    indiceVistaPreviaNormalizado
  ];
  const presentacionVistaPrevia = obtenerPresentacionTemplate(
    cuestionario.id,
  );
  const opcionesVistaPrevia = "opciones" in presentacionVistaPrevia
    ? presentacionVistaPrevia.opciones
    : undefined;
  const escalaVistaPrevia = "escala" in presentacionVistaPrevia
    ? presentacionVistaPrevia.escala
    : undefined;
  const abiertaVistaPrevia = "abierta" in presentacionVistaPrevia
    ? presentacionVistaPrevia.abierta
    : undefined;

  const vistaPreviaContacto = (
    <section aria-label="Vista previa de los datos de contacto" className="editor-preview-contact">
      <p className="editor-preview-kicker">Datos de contacto</p>
      <span className="editor-preview-required">Todos los campos son obligatorios</span>
      <div className="editor-preview-contact-fields">
        <span>Nombre <strong>*</strong></span>
        <span>Correo electrónico <strong>*</strong></span>
        <span>Teléfono / WhatsApp <strong>*</strong></span>
      </div>
      <details className="editor-preview-privacy">
        <summary>Leer aviso de privacidad</summary>
        <p>{TEXTO_AVISO_PRIVACIDAD}</p>
      </details>
      <div className="editor-preview-consent">
        <span aria-hidden="true" />
        He leído el aviso y consiento el uso de mis datos para los fines descritos.
      </div>
    </section>
  );

  async function cambiarPublicacion(
    accion: "publicar" | "despublicar",
  ) {
    setErrorGuardado("");
    setMensajeAccion("");
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
        setMensajeAccion("Cuestionario publicado correctamente.");
      } else if (accion === "despublicar" && onDespublicar) {
        await onDespublicar();
        setEnlacePublicado("");
        setMensajeAccion("Cuestionario despublicado.");
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
    mensajeExito?: string,
  ) {
    setMensajeAccion("");
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
      if (mensajeExito) {
        setMensajeAccion(mensajeExito);
      }
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
          <p className="custom-editor-scoring-note">Las respuestas se conservan y se mostrará el resultado fijo, sin calcular puntuaciones ni clasificaciones.</p>
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

      <div className="custom-editor-workspace">
        <div className="custom-editor-fields">
          <section
            aria-labelledby="editor-contact-heading"
            className="custom-editor-contact-settings"
            ref={contactReveal}
          >
            <header className="custom-editor-section-heading">
              <span aria-hidden="true" className="editor-section-number">01</span>
              <div>
                <p className="eyebrow">Primer paso</p>
                <h2 id="editor-contact-heading">Datos de contacto</h2>
                <p>Elige cuándo pedirlos. El formulario incluye los campos fijos que admite Clear-IA.</p>
              </div>
            </header>
            <div className="custom-editor-contact-body">
              <label>
                Momento de solicitud
                <select
                  onChange={(evento) => setCuestionario((actual) => ({
                    ...actual,
                    posicion_contacto: evento.target.value === "final"
                      ? "final"
                      : "inicio",
                  }))}
                  value={cuestionario.posicion_contacto}
                >
                  <option value="inicio">Antes de las preguntas</option>
                  <option value="final">Después de las preguntas</option>
                </select>
              </label>
              <ul aria-label="Campos obligatorios incluidos" className="custom-editor-contact-fields">
                <li>Nombre <span>Obligatorio</span></li>
                <li>Correo electrónico <span>Obligatorio</span></li>
                <li>Teléfono / WhatsApp <span>Obligatorio</span></li>
              </ul>
            </div>
          </section>

      <section
        aria-labelledby="editor-questions-heading"
        className="custom-editor-questions"
        ref={questionsReveal}
      >
        <header className="custom-editor-section-heading">
          <span aria-hidden="true" className="editor-section-number">02</span>
          <div>
            <p className="eyebrow">Contenido</p>
            <h2 id="editor-questions-heading">Preguntas</h2>
            <p>{cuestionario.preguntas.length} {cuestionario.preguntas.length === 1 ? "pregunta configurada" : "preguntas configuradas"}</p>
          </div>
        </header>
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
              <span aria-hidden="true" className="editor-question-number">
                {String(indicePregunta + 1).padStart(2, "0")}
              </span>
              <div className="editor-question-title">
                <span className="editor-question-type">
                  {etiquetaTipoPregunta(pregunta.tipo)}
                </span>
                <h3>Pregunta {indicePregunta + 1}</h3>
              </div>
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
          <section
            aria-labelledby="editor-scoring-heading"
            className="custom-editor-questions custom-editor-config-section"
            ref={scoringReveal}
          >
            <header className="custom-editor-section-heading">
              <span aria-hidden="true" className="editor-section-number">03</span>
              <div>
                <p className="eyebrow">Evaluación</p>
                <h2 id="editor-scoring-heading">Reglas de puntuación</h2>
                <p>Define los rangos y el segmento de resultado asociado.</p>
              </div>
            </header>
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
          <section
            aria-labelledby="editor-segments-heading"
            className="custom-editor-questions custom-editor-config-section"
            ref={segmentsReveal}
          >
            <header className="custom-editor-section-heading">
              <span aria-hidden="true" className="editor-section-number">04</span>
              <div>
                <p className="eyebrow">Personalización</p>
                <h2 id="editor-segments-heading">Resultados por segmento</h2>
                <p>Redacta el contenido que recibirá cada segmento.</p>
              </div>
            </header>
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
        <section
          aria-labelledby="editor-fixed-result-heading"
          className="custom-editor-questions custom-editor-config-section"
          ref={fixedResultReveal}
        >
          <header className="custom-editor-section-heading">
            <span aria-hidden="true" className="editor-section-number">03</span>
            <div>
              <p className="eyebrow">Cierre</p>
              <h2 id="editor-fixed-result-heading">Resultado fijo</h2>
              <p>Configura el contenido que se mostrará al terminar.</p>
            </div>
          </header>
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
        </div>

        <aside
          aria-labelledby="editor-preview-heading"
          className="custom-editor-preview"
          ref={previewReveal}
        >
          <header className="custom-editor-preview-header">
            <span className="editor-preview-live"><span aria-hidden="true" />Vista previa en vivo</span>
            <h2 id="editor-preview-heading">Así lo verá tu audiencia</h2>
            <p>Los cambios se reflejan aquí mientras editas.</p>
          </header>
          <div
            className="editor-preview-canvas questionnaire"
            data-style={cuestionario.estilo_visual}
            data-presentation="template"
            data-presentation-options={opcionesVistaPrevia}
          >
            <div className="editor-preview-brand">
              <img alt="" aria-hidden="true" src="/merkatic-brand-mark.png" />
              <span>CLEAR-IA</span>
            </div>
            <div className="editor-preview-progress">
              <span
                style={{
                  width: preguntaVistaPrevia
                    ? `${((indiceVistaPreviaNormalizado + 1) / cuestionario.preguntas.length) * 100}%`
                    : "0%",
                }}
              />
            </div>
            <p className="editor-preview-step">
              {preguntaVistaPrevia
                ? `Pregunta ${indiceVistaPreviaNormalizado + 1} de ${cuestionario.preguntas.length}`
                : "Sin preguntas"}
            </p>
            <div className="editor-preview-flow">
              {cuestionario.posicion_contacto === "inicio" && vistaPreviaContacto}
              {preguntaVistaPrevia ? (
                <article className="editor-preview-question question-card">
                  {preguntaVistaPrevia.seccion && (
                    <p className="question-card-section">
                      {preguntaVistaPrevia.seccion}
                    </p>
                  )}
                  <h3>{preguntaVistaPrevia.texto || "Escribe el texto de tu pregunta"}</h3>
                  {preguntaVistaPrevia.tipo === "opcion_multiple" && (
                    <ul className={[
                      "editor-preview-options",
                      "option-list",
                      `option-list-${opcionesVistaPrevia ?? "filas"}`,
                      preguntaVistaPrevia.opciones.length === 2
                        ? "option-list-binary"
                        : "",
                    ].filter(Boolean).join(" ")}>
                      {preguntaVistaPrevia.opciones.map((opcion, indice) => (
                        <li
                          className={[
                            "option",
                            `option-choice-${opcionesVistaPrevia ?? "filas"}`,
                            cuestionario.estilo_visual
                              ? `option-${cuestionario.estilo_visual}`
                              : "",
                          ].filter(Boolean).join(" ")}
                          key={`${preguntaVistaPrevia.id}-${indice}`}
                        >
                          {opcionesVistaPrevia === "tarjetas" &&
                            preguntaVistaPrevia.opciones.length !== 2 && (
                              <span aria-hidden="true" className="option-letter">
                                {String.fromCharCode(65 + (indice % 26))}
                              </span>
                            )}
                          {opcionesVistaPrevia === "filas" &&
                            preguntaVistaPrevia.opciones.length !== 2 && (
                              <span aria-hidden="true" className="option-number">
                                {String(indice + 1).padStart(2, "0")}
                              </span>
                            )}
                          <span className="option-choice-text">
                            {opcion.texto || `Opción ${indice + 1}`}
                          </span>
                          <span aria-hidden="true" className="editor-preview-radio" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {preguntaVistaPrevia.tipo === "escala" && (
                    escalaVistaPrevia === "deslizador" ? (
                      <div className="editor-preview-slider">
                        <input
                          aria-label="Vista previa del deslizador"
                          disabled
                          max={preguntaVistaPrevia.escala.max}
                          min={preguntaVistaPrevia.escala.min}
                          type="range"
                          value={preguntaVistaPrevia.escala.min}
                        />
                        <output>{preguntaVistaPrevia.escala.min}</output>
                        <p>
                          <span>{preguntaVistaPrevia.escala.etiqueta_min ?? preguntaVistaPrevia.escala.min}</span>
                          <span>{preguntaVistaPrevia.escala.etiqueta_max ?? preguntaVistaPrevia.escala.max}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="editor-preview-scale">
                        <div
                          aria-hidden="true"
                          className={`scale-choices scale-choices-${escalaVistaPrevia ?? "circulos"}`}
                        >
                          {Array.from(
                            {
                              length: preguntaVistaPrevia.escala.max -
                                preguntaVistaPrevia.escala.min + 1,
                            },
                            (_, indice) => preguntaVistaPrevia.escala.min + indice,
                          ).map((valor) => (
                            <span className="scale-choice" key={valor}>
                              <span>{valor}</span>
                            </span>
                          ))}
                        </div>
                        <p>
                          <span>{preguntaVistaPrevia.escala.etiqueta_min ?? preguntaVistaPrevia.escala.min}</span>
                          <span>{preguntaVistaPrevia.escala.etiqueta_max ?? preguntaVistaPrevia.escala.max}</span>
                        </p>
                      </div>
                    )
                  )}
                  {preguntaVistaPrevia.tipo === "abierta" && (
                    <div className={`editor-preview-textarea text-answer${abiertaVistaPrevia ? ` text-answer-${abiertaVistaPrevia}` : ""}`}>
                      Tu respuesta…
                    </div>
                  )}
                </article>
              ) : (
                <p className="editor-preview-empty">Agrega una pregunta para ver cómo aparecerá.</p>
              )}
              {cuestionario.posicion_contacto === "final" && vistaPreviaContacto}
            </div>
            {preguntaVistaPrevia && (
              <nav aria-label="Navegación de la vista previa" className="editor-preview-navigation">
                <button
                  aria-label="Pregunta anterior en la vista previa"
                  className="secondary-button"
                  disabled={indiceVistaPreviaNormalizado === 0}
                  onClick={() => setIndiceVistaPrevia((indice) => Math.max(0, indice - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <span>{String(indiceVistaPreviaNormalizado + 1).padStart(2, "0")} / {String(cuestionario.preguntas.length).padStart(2, "0")}</span>
                <button
                  aria-label="Pregunta siguiente en la vista previa"
                  className="secondary-button"
                  disabled={indiceVistaPreviaNormalizado >= cuestionario.preguntas.length - 1}
                  onClick={() => setIndiceVistaPrevia((indice) =>
                    Math.min(cuestionario.preguntas.length - 1, indice + 1),
                  )}
                  type="button"
                >
                  Siguiente
                </button>
              </nav>
            )}
          </div>
          <p className="editor-preview-note">
            Los puntos de scoring son internos y no se muestran a quienes responden.
          </p>
        </aside>
      </div>

      <footer aria-busy={guardando} className="custom-editor-actions">
        <button
          className="secondary-button"
          disabled={guardando}
          onClick={() => void validarYContinuar(
            (nombreEditado, data) => onGuardar(nombreEditado, data),
            "Cuestionario guardado correctamente.",
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
            }, "Cuestionario publicado correctamente.")}
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
      {mensajeAccion && (
        <p className="editor-action-status" role="status">{mensajeAccion}</p>
      )}
      {enlacePublicado && (
        <p className="published-questionnaire-link">
          URL pública: <a href={enlacePublicado}>{enlacePublicado}</a>
        </p>
      )}
    </main>
  );
}
