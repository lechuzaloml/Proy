import type { ResultadoCalculado } from "../logic/calcularResultado";

interface PantallaResultadoProps {
  calculo: Extract<ResultadoCalculado, { estado: "ok" }>;
}

export default function PantallaResultado({
  calculo,
}: PantallaResultadoProps) {
  return (
    <main className="questionnaire result-screen">
      <p className="eyebrow">Resultado</p>
      <article className="question-card">
        <p>{calculo.resultado.contenido}</p>
        {calculo.resultado.cta && (
          <div className="result-cta">
            <h2>{calculo.resultado.cta.texto}</h2>
            <p>
              Acción informativa: {calculo.resultado.cta.accion}
            </p>
          </div>
        )}
      </article>
    </main>
  );
}
