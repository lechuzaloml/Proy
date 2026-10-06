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

interface RenderizadorCuestionarioProps {
  cuestionario: Cuestionario;
  onEnvio: (lead: Lead, calculo: ResultadoCalculado) => void;
}

interface EntradaPregunta {
  pregunta: Pregunta;
  indice: number;
}

export default function RenderizadorCuestionario({
  cuestionario,
  onEnvio,
}: RenderizadorCuestionarioProps) {
  const [respuestas, setRespuestas] = useState<RespuestasCuestionario>({});
  const [datosContacto, setDatosContacto] = useState<DatosContacto | null>(null);
  const [mostrarPreguntas, setMostrarPreguntas] = useState(
    cuestionario.posicion_contacto !== "inicio",
  );

  function finalizar(datos: DatosContacto) {
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
    onEnvio(lead, calcularResultado(cuestionario, respuestas));
  }

  function actualizarRespuesta(indice: number, respuesta: Respuesta) {
    setRespuestas((actuales) => ({ ...actuales, [indice]: respuesta }));
  }

  function enviarRespuestas() {
    if (cuestionario.posicion_contacto === "inicio" && datosContacto) {
      finalizar(datosContacto);
      return;
    }
    setMostrarPreguntas(false);
  }

  function completarContacto(datos: DatosContacto) {
    setDatosContacto(datos);
    if (cuestionario.posicion_contacto === "inicio") {
      setMostrarPreguntas(true);
      return;
    }
    finalizar(datos);
  }

  const entradas = cuestionario.preguntas.map((pregunta, indice) => ({
    pregunta,
    indice,
  }));

  function renderPregunta({ pregunta, indice }: EntradaPregunta) {
    const idPregunta = `pregunta-${indice}`;

    return (
      <article className="question-card" key={indice}>
        <h3 id={idPregunta}>{pregunta.texto}</h3>
        {pregunta.tipo === "opcion_multiple" && (
          <fieldset aria-labelledby={idPregunta} className="option-list">
            {pregunta.opciones.map((opcion, indiceOpcion) => (
              <label className="option" key={indiceOpcion}>
                <input
                  checked={
                    respuestas[indice]?.tipo === "opcion_multiple" &&
                    respuestas[indice].indiceOpcion === indiceOpcion
                  }
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
                <span>{opcion.texto}</span>
              </label>
            ))}
          </fieldset>
        )}
        {pregunta.tipo === "escala" && (
          <div className="scale-control">
            <label className="sr-only" htmlFor={idPregunta}>
              {pregunta.texto}
            </label>
            <input
              id={idPregunta}
              max={pregunta.escala.max}
              min={pregunta.escala.min}
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
            {(pregunta.escala.etiqueta_min !== undefined ||
              pregunta.escala.etiqueta_max !== undefined) && (
              <div className="scale-labels">
                {pregunta.escala.etiqueta_min !== undefined && (
                  <span>{pregunta.escala.etiqueta_min}</span>
                )}
                {pregunta.escala.etiqueta_max !== undefined && (
                  <span>{pregunta.escala.etiqueta_max}</span>
                )}
              </div>
            )}
          </div>
        )}
        {pregunta.tipo === "abierta" && (
          <label className="text-answer">
            <span className="sr-only">{pregunta.texto}</span>
            <textarea
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
          </label>
        )}
      </article>
    );
  }

  const secciones = cuestionario.secciones ?? [];

  return (
    <main className="questionnaire">
      <header className="questionnaire-header">
        <p className="eyebrow">Cuestionario</p>
        <h1>{cuestionario.cliente}</h1>
      </header>
      {!mostrarPreguntas && (
        <FormularioContacto onCompletar={completarContacto} />
      )}
      {mostrarPreguntas && (
        <>
          {secciones.length === 0 ? (
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
          <button
            className="submit-button"
            onClick={enviarRespuestas}
            type="button"
          >
            {cuestionario.posicion_contacto === "final"
              ? "Continuar"
              : "Enviar"}
          </button>
        </>
      )}
    </main>
  );
}
