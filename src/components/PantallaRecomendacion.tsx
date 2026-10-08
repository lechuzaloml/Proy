import { useState } from "react";
import type { MetadataTemplate } from "../templates/catalogo";
import type { PlanRecomendado } from "../config/recomendaciones";

interface PantallaRecomendacionProps {
  contenido: string;
  plan: PlanRecomendado;
  template: MetadataTemplate;
  onVerTemplate: () => void;
}

export default function PantallaRecomendacion({
  contenido,
  plan,
  template,
  onVerTemplate,
}: PantallaRecomendacionProps) {
  const [mostrarAvisoPago, setMostrarAvisoPago] = useState(false);

  return (
    <main className="recommendation-layout">
      <section aria-labelledby="recommendation-title" className="recommendation-copy">
        <p className="eyebrow">Recomendación para tu negocio</p>
        <h1 id="recommendation-title">Por qué encaja</h1>
        <p className="recommendation-reason">{contenido}</p>

        <article className="recommended-template">
          <p className="eyebrow">Template recomendado</p>
          <h2>{template.nombre}</h2>
          <p>{template.descripcion}</p>
          <button
            className="secondary-button"
            onClick={onVerTemplate}
            type="button"
          >
            Ver este template (demo)
          </button>
        </article>
      </section>

      <section aria-labelledby="plan-title" className="recommendation-plan">
        <p className="eyebrow">Plan recomendado</p>
        <h2 id="plan-title">{plan.nombre}</h2>
        <p className="plan-price">{plan.precio}</p>
        <p className="plan-price-note">{plan.notaPrecio}</p>

        <ul aria-label="Beneficios del plan" className="plan-benefits">
          {plan.beneficios.map((beneficio) => (
            <li className="plan-benefit" key={beneficio.texto}>
              <span>{beneficio.texto}</span>
              <span
                className={`benefit-status benefit-status-${beneficio.estado}`}
              >
                {beneficio.estado === "disponible"
                  ? "Disponible"
                  : "Próximamente"}
              </span>
            </li>
          ))}
        </ul>

        {plan.enlacePago ? (
          <a
            className="submit-button plan-submit"
            href={plan.enlacePago}
            rel="noopener noreferrer"
            target="_blank"
          >
            {plan.textoBoton}
          </a>
        ) : (
          <button
            className="submit-button plan-submit"
            onClick={() => setMostrarAvisoPago(true)}
            type="button"
          >
            {plan.textoBoton}
          </button>
        )}
        {mostrarAvisoPago && (
          <p aria-live="polite" className="plan-payment-notice" role="status">
            El pago se habilitará próximamente.
          </p>
        )}
      </section>
    </main>
  );
}
