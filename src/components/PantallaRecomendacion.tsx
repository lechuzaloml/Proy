import type { MetadataTemplate } from "../templates/catalogo";
import CalculadoraImpacto from "./CalculadoraImpacto";
import OfertaPremium from "./OfertaPremium";

interface PantallaRecomendacionProps {
  contenido: string;
  template: MetadataTemplate;
  onVerTemplate: () => void;
  onVerPlanes: () => void;
}

export default function PantallaRecomendacion({
  contenido,
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
          <h2>Por qué encaja</h2>
          <p>{contenido}</p>
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
      <OfertaPremium />
    </main>
  );
}
