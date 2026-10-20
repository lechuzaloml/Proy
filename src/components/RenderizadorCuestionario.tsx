import { useState } from "react";
import type { Cuestionario, Lead, Pregunta } from "../types/model";
import FormularioContacto, {
  type DatosContacto,
} from "./FormularioContacto";
import {
  calcularResultado,
  type ResultadoCalculado,
  type Respuesta,
  type RespuestasCuestionario,
} from "../logic/calcularResultado";
import { personalizarResultado } from "../logic/personalizarResultado";
import type { RespuestaParaPersonalizacion } from "../logic/personalizarResultado";
import type { Presentacion } from "../config/presentacionTemplates";

export interface EstadoFlujoCuestionario {
  respuestas: RespuestasCuestionario;
  datosContacto: DatosContacto | null;
  consentimientoAceptado: boolean;
  indicePreguntaActual: number;
  mostrarPreguntas: boolean;
}

interface RenderizadorCuestionarioProps {
  cuestionario: Cuestionario;
  onEnvio: (
    lead: Lead,
    calculo: ResultadoCalculado,
    respuestas: RespuestasCuestionario,
    contenidoPersonalizado: string | null,
    errorPersonalizacion: string | null,
  ) => void;
  estadoInicial?: EstadoFlujoCuestionario | null;
  onEstadoChange?: (
    estado: EstadoFlujoCuestionario,
    modoHistorial?: "reemplazar" | "avanzar" | "retroceder",
  ) => void;
  unaPreguntaPorVista?: boolean;
  requiereConsentimiento?: boolean;
  presentacion?: Presentacion;
}

interface EntradaPregunta {
  pregunta: Pregunta;
  indice: number;
}

export default function RenderizadorCuestionario({
  cuestionario,
  onEnvio,
  estadoInicial,
  onEstadoChange,
  unaPreguntaPorVista = false,
  requiereConsentimiento = false,
  presentacion,
}: RenderizadorCuestionarioProps) {
  const [respuestas, setRespuestas] = useState<RespuestasCuestionario>(
    () => estadoInicial?.respuestas ?? {},
  );
  const [datosContacto, setDatosContacto] = useState<DatosContacto | null>(
    () => estadoInicial?.datosContacto ?? null,
  );
  const [consentimientoAceptado, setConsentimientoAceptado] = useState(
    () => estadoInicial?.consentimientoAceptado ?? false,
  );
  const [indicePreguntaActual, setIndicePreguntaActual] = useState(
    () => estadoInicial?.indicePreguntaActual ?? 0,
  );
  const [mostrarPreguntas, setMostrarPreguntas] = useState(
    () =>
      estadoInicial?.mostrarPreguntas ??
      cuestionario.posicion_contacto !== "inicio",
  );
  const [generandoResultado, setGenerandoResultado] = useState(false);
  const estiloVisual = cuestionario.estilo_visual;

  function publicarEstado(
    siguiente: Partial<EstadoFlujoCuestionario>,
    modoHistorial: "reemplazar" | "avanzar" | "retroceder" = "reemplazar",
  ) {
    onEstadoChange?.(
      {
        respuestas,
        datosContacto,
        consentimientoAceptado,
        indicePreguntaActual,
        mostrarPreguntas,
        ...siguiente,
      },
      modoHistorial,
    );
  }

  async function finalizar(datos: DatosContacto) {
    const lead: Lead = {
      cuestionarioId: cuestionario.id,
      ...datos,
      respuestas: Object.fromEntries(
        Object.entries(respuestas).map(([indice, respuesta]) => {
          const pregunta = cuestionario.preguntas[Number(indice)];
          return [pregunta?.id ?? indice, respuesta];
        }),
      ),
    };
    const calculo = calcularResultado(cuestionario, respuestas);
    if (calculo.estado !== "ok") {
      onEnvio(lead, calculo, respuestas, null, null);
      return;
    }

    setGenerandoResultado(true);
    let contenidoPersonalizado: string | null = null;
    let errorPersonalizacion: string | null = null;

    try {
      const respuestasLegibles = cuestionario.preguntas.flatMap(
        (pregunta, indice): RespuestaParaPersonalizacion[] => {
          const respuesta = respuestas[indice];
          if (!respuesta) {
            return [];
          }

          let valor: string;
          if (
            pregunta.tipo === "opcion_multiple" &&
            respuesta.tipo === "opcion_multiple"
          ) {
            const opcion = pregunta.opciones[respuesta.indiceOpcion];
            if (!opcion) {
              return [];
            }
            valor = opcion.texto;
          } else if (
            pregunta.tipo === "escala" &&
            respuesta.tipo === "escala"
          ) {
            valor = String(respuesta.valor);
          } else if (
            pregunta.tipo === "abierta" &&
            respuesta.tipo === "abierta"
          ) {
            valor = respuesta.valor.trim();
          } else {
            return [];
          }

          return valor
            ? [{ pregunta: pregunta.texto, respuesta: valor }]
            : [];
        },
      );
      const solicitud = {
        nombreCuestionario: cuestionario.cliente,
        resultadoBase: calculo.resultado.contenido,
        respuestas: respuestasLegibles,
        ...(calculo.tipo === "segmentado"
          ? { segmento: calculo.segmento }
          : {}),
      };
      contenidoPersonalizado = await personalizarResultado(solicitud);
    } catch (error) {
      errorPersonalizacion =
        error instanceof Error
          ? error.message
          : "No se pudo personalizar el resultado con Gemini.";
    }

    onEnvio(
      lead,
      calculo,
      respuestas,
      contenidoPersonalizado,
      errorPersonalizacion,
    );
  }

  function actualizarRespuesta(indice: number, respuesta: Respuesta) {
    const siguientesRespuestas = { ...respuestas, [indice]: respuesta };
    setRespuestas(siguientesRespuestas);
    publicarEstado({ respuestas: siguientesRespuestas });
  }

  function actualizarDatosContacto(datos: DatosContacto) {
    setDatosContacto(datos);
    publicarEstado({ datosContacto: datos });
  }

  function actualizarConsentimiento(aceptado: boolean) {
    setConsentimientoAceptado(aceptado);
    publicarEstado({ consentimientoAceptado: aceptado });
  }

  function cambiarPregunta(indice: number) {
    if (indice < indicePreguntaActual && onEstadoChange) {
      publicarEstado({ indicePreguntaActual: indice }, "retroceder");
      return;
    }

    setIndicePreguntaActual(indice);
    publicarEstado(
      { indicePreguntaActual: indice },
      indice > indicePreguntaActual ? "avanzar" : "reemplazar",
    );
  }

  function preguntaRespondida(indice: number): boolean {
    const pregunta = entradas[indice]?.pregunta;
    const respuesta = respuestas[indice];

    if (!pregunta) {
      return false;
    }
    if (!respuesta) {
      return false;
    }
    if (respuesta.tipo === "abierta") {
      return respuesta.valor.trim().length > 0;
    }
    return true;
  }

  function enviarRespuestas() {
    if (cuestionario.posicion_contacto === "inicio" && datosContacto) {
      finalizar(datosContacto);
      return;
    }
    setMostrarPreguntas(false);
    publicarEstado({ mostrarPreguntas: false }, "avanzar");
  }

  function completarContacto(datos: DatosContacto) {
    setDatosContacto(datos);
    if (cuestionario.posicion_contacto === "inicio") {
      setMostrarPreguntas(true);
      publicarEstado(
        {
          datosContacto: datos,
          mostrarPreguntas: true,
        },
        "avanzar",
      );
      return;
    }
    finalizar(datos);
  }

  const entradas = cuestionario.preguntas.map((pregunta, indice) => ({
    pregunta,
    indice,
  }));
  const entradaActual = entradas[indicePreguntaActual];
  const opcionesPresentacion =
    presentacion && "opciones" in presentacion
      ? presentacion.opciones
      : undefined;
  const escalaPresentacion =
    presentacion && "escala" in presentacion ? presentacion.escala : undefined;
  const abiertaPresentacion =
    presentacion && "abierta" in presentacion ? presentacion.abierta : undefined;

  function renderPregunta({ pregunta, indice }: EntradaPregunta) {
    const idPregunta = `pregunta-${indice}`;
    const esOpcionDoble =
      pregunta.tipo === "opcion_multiple" && pregunta.opciones.length === 2;
    const esEscalaVisual = presentacion
      ? (escalaPresentacion ?? "deslizador") !== "deslizador"
      : pregunta.tipo === "escala" &&
        Number.isInteger(pregunta.escala.min) &&
        Number.isInteger(pregunta.escala.max) &&
        pregunta.escala.max - pregunta.escala.min <= 9 &&
        (estiloVisual === "finanzas" ||
          estiloVisual === "ciberseguridad" ||
          estiloVisual === "liderazgo" ||
          estiloVisual === "madurez-digital" ||
          estiloVisual === "masterclass");

    return (
      <article className="question-card" key={indice}>
        {presentacion && unaPreguntaPorVista && pregunta.seccion && (
          <p className="question-card-section">{pregunta.seccion}</p>
        )}
        <h3 id={idPregunta}>{pregunta.texto}</h3>
        {pregunta.tipo === "opcion_multiple" && (
          <fieldset
            aria-labelledby={idPregunta}
            className={[
              "option-list",
              `option-list-${opcionesPresentacion ?? estiloVisual ?? "default"}`,
              estiloVisual ? `option-list-${estiloVisual}` : "",
              esOpcionDoble ? "option-list-binary" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {pregunta.opciones.map((opcion, indiceOpcion) => {
              const respuesta = respuestas[indice];
              const seleccionada =
                respuesta?.tipo === "opcion_multiple" &&
                respuesta.indiceOpcion === indiceOpcion;

              return (
                <label
                  className={[
                    "option",
                    estiloVisual ? `option-${estiloVisual}` : "",
                    opcionesPresentacion
                      ? `option-choice-${opcionesPresentacion}`
                      : "",
                    seleccionada ? "option-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={indiceOpcion}
                >
                  <input
                    checked={seleccionada}
                    name={`respuesta-${indice}`}
                    onChange={() =>
                      actualizarRespuesta(indice, {
                        tipo: "opcion_multiple",
                        indiceOpcion,
                      })
                    }
                    type="radio"
                    value={opcion.texto}
                  />
                  {opcionesPresentacion === "tarjetas" && !esOpcionDoble && (
                    <span aria-hidden="true" className="option-letter">
                      {String.fromCharCode(65 + (indiceOpcion % 26))}
                    </span>
                  )}
                  {opcionesPresentacion === "filas" && !esOpcionDoble && (
                    <span aria-hidden="true" className="option-number">
                      {String(indiceOpcion + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="option-choice-text">{opcion.texto}</span>
                  {presentacion && (
                    <span aria-hidden="true" className="option-selection-mark">
                      {seleccionada ? "✓" : ""}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        )}
        {pregunta.tipo === "escala" && (
          esEscalaVisual ? (
            <fieldset
              aria-labelledby={idPregunta}
              className={`scale-choice-fieldset scale-choice-fieldset-${estiloVisual}`}
            >
              <legend className="sr-only">{pregunta.texto}</legend>
              <div
                className={`scale-choices ${
                  presentacion
                    ? `scale-choices-${escalaPresentacion ?? "circulos"}`
                    : estiloVisual === "madurez-digital"
                      ? "scale-choices-segments"
                      : "scale-choices-circles"
                }`}
              >
                {Array.from(
                  {
                    length:
                      pregunta.escala.max - pregunta.escala.min + 1,
                  },
                  (_, offset) => pregunta.escala.min + offset,
                ).map((valor) => {
                  const seleccionada =
                    respuestas[indice]?.tipo === "escala" &&
                    respuestas[indice].valor === valor;

                  return (
                    <label
                      className={`scale-choice${
                        seleccionada ? " scale-choice-selected" : ""
                      }`}
                      key={valor}
                    >
                      <input
                        checked={seleccionada}
                        name={`respuesta-${indice}`}
                        onChange={() =>
                          actualizarRespuesta(indice, {
                            tipo: "escala",
                            valor,
                          })
                        }
                        type="radio"
                        value={valor}
                      />
                      <span>{valor}</span>
                    </label>
                  );
                })}
              </div>
              {(presentacion !== undefined ||
                pregunta.escala.etiqueta_min !== undefined ||
                pregunta.escala.etiqueta_max !== undefined) && (
                <div className="scale-labels">
                  {presentacion ? (
                    <>
                      <span>
                        {pregunta.escala.etiqueta_min ??
                          String(pregunta.escala.min)}
                      </span>
                      <span>
                        {pregunta.escala.etiqueta_max ??
                          String(pregunta.escala.max)}
                      </span>
                    </>
                  ) : (
                    <>
                      {pregunta.escala.etiqueta_min !== undefined && (
                        <span>{pregunta.escala.etiqueta_min}</span>
                      )}
                      {pregunta.escala.etiqueta_max !== undefined && (
                        <span>{pregunta.escala.etiqueta_max}</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </fieldset>
          ) : (
            <div className={`scale-control${presentacion ? " scale-control-presentacion" : ""}`}>
              <label className="sr-only" htmlFor={idPregunta}>
                {pregunta.texto}
              </label>
              <input
                id={idPregunta}
                max={pregunta.escala.max}
                min={pregunta.escala.min}
                onClick={(evento) =>
                  actualizarRespuesta(indice, {
                    tipo: "escala",
                    valor: Number(evento.currentTarget.value),
                  })
                }
                onChange={(evento) =>
                  actualizarRespuesta(indice, {
                    tipo: "escala",
                    valor: Number(evento.target.value),
                  })
                }
                type="range"
                value={
                  respuestas[indice]?.tipo === "escala"
                    ? respuestas[indice].valor
                    : pregunta.escala.min
                }
              />
              <output aria-live="polite">
                {respuestas[indice]?.tipo === "escala"
                  ? respuestas[indice].valor
                  : pregunta.escala.min}
              </output>
              {(presentacion !== undefined ||
                pregunta.escala.etiqueta_min !== undefined ||
                pregunta.escala.etiqueta_max !== undefined) && (
                <div className="scale-labels">
                  {presentacion ? (
                    <>
                      <span>
                        {pregunta.escala.etiqueta_min ??
                          String(pregunta.escala.min)}
                      </span>
                      <span>
                        {pregunta.escala.etiqueta_max ??
                          String(pregunta.escala.max)}
                      </span>
                    </>
                  ) : (
                    <>
                      {pregunta.escala.etiqueta_min !== undefined && (
                        <span>{pregunta.escala.etiqueta_min}</span>
                      )}
                      {pregunta.escala.etiqueta_max !== undefined && (
                        <span>{pregunta.escala.etiqueta_max}</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        )}
        {pregunta.tipo === "abierta" && (
          <>
            <p className="sensitive-data-notice">
              No escribas datos sensibles.
            </p>
            <label
              className={`text-answer${
                abiertaPresentacion ? ` text-answer-${abiertaPresentacion}` : ""
              }`}
            >
              <span className="sr-only">{pregunta.texto}</span>
              <textarea
                id={`${idPregunta}-respuesta`}
                maxLength={pregunta.limite_caracteres}
                onChange={(evento) =>
                  actualizarRespuesta(indice, {
                    tipo: "abierta",
                    valor: evento.target.value,
                  })
                }
                value={
                  respuestas[indice]?.tipo === "abierta"
                    ? respuestas[indice].valor
                    : ""
                }
              />
              {abiertaPresentacion === "amplia" &&
                pregunta.limite_caracteres !== undefined && (
                  <output
                    aria-label="Caracteres utilizados"
                    className="text-answer-counter"
                    htmlFor={`${idPregunta}-respuesta`}
                  >
                    {(respuestas[indice]?.tipo === "abierta"
                      ? respuestas[indice].valor.length
                      : 0) +
                      ` / ${pregunta.limite_caracteres}`}
                  </output>
                )}
            </label>
          </>
        )}
      </article>
    );
  }

  const secciones = cuestionario.secciones ?? [];

  return (
    <main
      className="questionnaire"
      data-style={estiloVisual}
      data-presentation={presentacion ? "template" : undefined}
      data-presentation-options={opcionesPresentacion}
    >
      {generandoResultado && (
        <p aria-live="polite" className="eyebrow">
          Preparando tu resultado personalizado…
        </p>
      )}
      <header className="questionnaire-header">
        <p className="eyebrow">Cuestionario</p>
        <h1>{cuestionario.cliente}</h1>
      </header>
      {!mostrarPreguntas && (
        <div className="contact-form-view">
          <FormularioContacto
            datosIniciales={datosContacto ?? undefined}
            deshabilitado={generandoResultado}
            requiereConsentimiento={requiereConsentimiento}
            consentimientoAceptado={consentimientoAceptado}
            onConsentimientoChange={actualizarConsentimiento}
            onCambio={actualizarDatosContacto}
            onCompletar={completarContacto}
          />
        </div>
      )}
      {mostrarPreguntas && (
        <>
          {unaPreguntaPorVista && entradaActual ? (
            <>
              <progress
                aria-label="Progreso del cuestionario"
                className="question-progress-bar"
                max={entradas.length}
                value={indicePreguntaActual + 1}
              />
              <p aria-live="polite" className="question-progress">
                Pregunta {indicePreguntaActual + 1} de {entradas.length}
              </p>
              <section
                className="question-section question-step-panel"
                key={presentacion ? indicePreguntaActual : 0}
              >
                {(!presentacion || !unaPreguntaPorVista) &&
                  entradaActual.pregunta.seccion && (
                    <h2>{entradaActual.pregunta.seccion}</h2>
                  )}
                <div className="question-list">
                  {renderPregunta(entradaActual)}
                </div>
              </section>
              <div className="question-step-navigation">
                {indicePreguntaActual > 0 && (
                  <button
                    className="secondary-button"
                    onClick={() => cambiarPregunta(indicePreguntaActual - 1)}
                    disabled={generandoResultado}
                    type="button"
                  >
                    Anterior
                  </button>
                )}
                {indicePreguntaActual < entradas.length - 1 ? (
                  <button
                    className="submit-button"
                    disabled={
                      generandoResultado ||
                      !preguntaRespondida(indicePreguntaActual)
                    }
                    onClick={() => cambiarPregunta(indicePreguntaActual + 1)}
                    type="button"
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    className="submit-button"
                    disabled={
                      generandoResultado ||
                      !preguntaRespondida(indicePreguntaActual)
                    }
                    onClick={enviarRespuestas}
                    type="button"
                  >
                    {generandoResultado
                      ? "Generando resultado…"
                      : cuestionario.posicion_contacto === "final"
                      ? "Continuar"
                      : "Ver resultado"}
                  </button>
                )}
              </div>
            </>
          ) : secciones.length === 0 ? (
            <div className="question-list">{entradas.map(renderPregunta)}</div>
          ) : (
            <>
              {secciones.map((seccion) => (
                <section className="question-section" key={seccion}>
                  <h2>{seccion}</h2>
                  <div className="question-list">
                    {entradas
                      .filter(({ pregunta }) => pregunta.seccion === seccion)
                      .map(renderPregunta)}
                  </div>
                </section>
              ))}
              {entradas.some(
                ({ pregunta }) =>
                  pregunta.seccion !== undefined &&
                  !secciones.includes(pregunta.seccion),
              ) && (
                <section className="question-section">
                  {[
                    ...new Set(
                      entradas
                        .map(({ pregunta }) => pregunta.seccion)
                        .filter(
                          (seccion): seccion is string =>
                            seccion !== undefined &&
                            !secciones.includes(seccion),
                        ),
                    ),
                  ].map((seccion) => (
                    <div key={seccion}>
                      <h2>{seccion}</h2>
                      <div className="question-list">
                        {entradas
                          .filter(
                            ({ pregunta }) => pregunta.seccion === seccion,
                          )
                          .map(renderPregunta)}
                      </div>
                    </div>
                  ))}
                </section>
              )}
              {entradas.some(
                ({ pregunta }) => pregunta.seccion === undefined,
              ) && (
                <section className="question-section">
                  <h2>Sin sección</h2>
                  <div className="question-list">
                    {entradas
                      .filter(
                        ({ pregunta }) => pregunta.seccion === undefined,
                      )
                      .map(renderPregunta)}
                  </div>
                </section>
              )}
            </>
          )}
          {!unaPreguntaPorVista && (
            <button
              className="submit-button"
              onClick={enviarRespuestas}
              type="button"
            >
              {cuestionario.posicion_contacto === "final"
                ? "Continuar"
                : "Enviar"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
