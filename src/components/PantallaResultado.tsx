import type {
  RespuestasCuestionario,
  ResultadoCalculado,
} from "../logic/calcularResultado";
import { calcularPerfilSecciones } from "../logic/calcularPerfilSecciones";
import type { Cuestionario } from "../types/model";

interface PantallaResultadoProps {
  calculo: Extract<ResultadoCalculado, { estado: "ok" }>;
  cuestionario: Cuestionario;
  respuestas: RespuestasCuestionario;
  contenidoPersonalizado: string | null;
  errorPersonalizacion: string | null;
}

const CENTRO = 160;
const RADIO = 112;

export default function PantallaResultado({
  calculo,
  cuestionario,
  respuestas,
  contenidoPersonalizado,
  errorPersonalizacion,
}: PantallaResultadoProps) {
  const dimensiones = cuestionario.usa_scoring
    ? calcularPerfilSecciones(cuestionario, respuestas).filter((dimension) =>
        cuestionario.preguntas.some(
          (pregunta) =>
            pregunta.participa_scoring &&
            pregunta.seccion === dimension.nombre,
        ),
      )
    : [];
  const puntos = dimensiones.map((dimension, indice) => {
    const angulo = -Math.PI / 2 + (indice * 2 * Math.PI) / dimensiones.length;
    const distancia = (dimension.porcentaje / 100) * RADIO;
    return {
      x: CENTRO + Math.cos(angulo) * distancia,
      y: CENTRO + Math.sin(angulo) * distancia,
    };
  });

  return (
    <main className="questionnaire result-screen">
      <p className="eyebrow">Resultado</p>
      {errorPersonalizacion && (
        <p className="validation-errors" role="status">
          No se pudo generar la versión personalizada. Se muestra el resultado
          base. Detalle: {errorPersonalizacion}
        </p>
      )}
      <article className="question-card">
        <p>{contenidoPersonalizado ?? calculo.resultado.contenido}</p>
        {calculo.resultado.cta && (
          <div className="result-cta">
            <h2>{calculo.resultado.cta.texto}</h2>
            <p>
              Acción informativa: {calculo.resultado.cta.accion}
            </p>
          </div>
        )}
      </article>
      {dimensiones.length >= 3 && (
        <section
          aria-labelledby="result-profile-title"
          className="result-profile"
        >
          <header className="result-profile-header">
            <p className="eyebrow">Perfil por categoría</p>
            <h2 id="result-profile-title">
              Así se distribuye tu resultado por categoría
            </h2>
            <p>
              Cada porcentaje muestra los puntos obtenidos frente al máximo
              posible en esa categoría. Las preguntas abiertas no se puntúan.
            </p>
          </header>
          <div className="result-profile-content">
            <svg
              aria-label="Gráfica radial del puntaje por categoría"
              className="result-profile-chart"
              role="img"
              viewBox="0 0 320 320"
            >
              {[25, 50, 75, 100].map((nivel) => (
                <circle
                  className="result-profile-grid"
                  cx={CENTRO}
                  cy={CENTRO}
                  key={nivel}
                  r={(nivel / 100) * RADIO}
                />
              ))}
              {dimensiones.map((dimension, indice) => {
                const angulo =
                  -Math.PI / 2 + (indice * 2 * Math.PI) / dimensiones.length;
                const x = CENTRO + Math.cos(angulo) * RADIO;
                const y = CENTRO + Math.sin(angulo) * RADIO;

                return (
                  <line
                    className="result-profile-axis"
                    key={dimension.nombre}
                    x1={CENTRO}
                    x2={x}
                    y1={CENTRO}
                    y2={y}
                  />
                );
              })}
              {puntos.length >= 3 && (
                <polygon
                  className="result-profile-area"
                  points={puntos.map(({ x, y }) => `${x},${y}`).join(" ")}
                />
              )}
              {puntos.map((punto, indice) => (
                <circle
                  className="result-profile-point"
                  cx={punto.x}
                  cy={punto.y}
                  key={dimensiones[indice]?.nombre}
                  r="6"
                >
                  <title>
                    {dimensiones[indice]?.nombre}:{" "}
                    {dimensiones[indice]?.porcentaje}%
                  </title>
                </circle>
              ))}
            </svg>
            <ol className="result-profile-dimensions">
              {dimensiones.map((dimension, indice) => (
                <li key={dimension.nombre}>
                  <span aria-hidden="true" className="result-profile-index">
                    {indice + 1}
                  </span>
                  <div className="result-profile-detail">
                    <h3>{dimension.nombre}</h3>
                    <p>
                      {dimension.respondidas} de {dimension.totalPreguntas}{" "}
                      preguntas puntuadas respondidas
                    </p>
                    <progress
                      aria-label={`${dimension.nombre}: ${dimension.porcentaje}%`}
                      max="100"
                      value={dimension.porcentaje}
                    />
                  </div>
                  <strong>{dimension.porcentaje}%</strong>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </main>
  );
}
