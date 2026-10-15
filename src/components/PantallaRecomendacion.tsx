import type { MetadataTemplate } from "../templates/catalogo";
import CalculadoraImpacto from "./CalculadoraImpacto";
import OfertaAcompanamiento from "./OfertaAcompanamiento";
import OfertaPremium from "./OfertaPremium";

interface PantallaRecomendacionProps {
  contenido: string;
  errorPersonalizacion: string | null;
  template: MetadataTemplate;
  onVerTemplate: () => void;
  onVerPlanes: () => void;
}

export default function PantallaRecomendacion({
  contenido,
  errorPersonalizacion,
  template,
  onVerTemplate,
  onVerPlanes,
}: PantallaRecomendacionProps) {
  return (
    <main className="recommendation-page">
      <section
        aria-labelledby="recommendation-title"
        className="recommendation-copy"
      >
        <p className="eyebrow">Template recomendado</p>
        <h1 id="recommendation-title">{template.nombre}</h1>
        <p className="recommended-template-description">
          {template.descripcion}
        </p>
        <button
          className="secondary-button"
          onClick={onVerTemplate}
          type="button"
        >
          Ver este template (demo)
        </button>

        <div className="recommendation-reason">
          <img
            alt="Asistente de Clear-IA"
            className="recommendation-assistant-mark"
            src="/clear-ia-assistant.png"
          />
          <div className="recommendation-reason-copy">
            <h2>Por qué encaja</h2>
            {errorPersonalizacion && (
              <p role="status">
                No se pudo personalizar esta recomendación; mostramos el texto
                base. Detalle: {errorPersonalizacion}
              </p>
            )}
            <p>{contenido}</p>
          </div>
        </div>

        <button
          className="submit-button recommendation-plans-button"
          onClick={onVerPlanes}
          type="button"
        >
          Ver planes disponibles
        </button>
      </section>
      <CalculadoraImpacto />
      <OfertaAcompanamiento />
      <OfertaPremium />
    </main>
  );
}
