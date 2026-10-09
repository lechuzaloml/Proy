import { useState } from "react";
import type { PlanRecomendado } from "../config/recomendaciones";

interface PantallaPlanesProps {
  planes: PlanRecomendado[];
  planRecomendadoNombre: string;
}

export default function PantallaPlanes({
  planes,
  planRecomendadoNombre,
}: PantallaPlanesProps) {
  const [planSeleccionado, setPlanSeleccionado] = useState<string | null>(null);

  return (
    <main className="plans-page">
      <header className="landing-brand">
        <span aria-hidden="true" className="landing-brand-mark">
          C
        </span>
        <span>CLEAR-IA</span>
      </header>

      <section aria-labelledby="plans-title" className="plans-hero">
        <div className="plans-intro">
          <p className="landing-kicker">Opciones para tu negocio</p>
          <h1 id="plans-title">Elige el plan que acompaña tu crecimiento</h1>
          <p className="landing-description">
            Compara las opciones disponibles y selecciona el plan que mejor se
            adapte a las necesidades de tu negocio.
          </p>
        </div>

        <aside aria-label="Tu recomendación" className="plans-purpose">
          <p className="eyebrow">Tu punto de partida</p>
          <h2>Una opción recomendada para ti</h2>
          <p>
            De acuerdo con tus respuestas, el plan{" "}
            <strong>{planRecomendadoNombre}</strong> es el que mejor se ajusta
            a tu diagnóstico. También puedes comparar las otras opciones.
          </p>
        </aside>
      </section>

      <section aria-label="Planes disponibles" className="available-plans">
        {planes.map((plan) => {
          const esRecomendado = plan.nombre === planRecomendadoNombre;
          const textoBoton = `Elegir ${plan.nombre}`;

          return (
            <article
              className={`recommendation-plan available-plan${esRecomendado ? " available-plan-recommended" : ""}`}
              key={plan.nombre}
            >
              <div className="available-plan-heading">
                <p className="eyebrow">
                  {esRecomendado ? "Recomendado para ti" : "Plan Clear-IA"}
                </p>
                <h2>{plan.nombre}</h2>
              </div>
              <p className="plan-price">{plan.precio}</p>
              <p className="plan-price-note">{plan.notaPrecio}</p>

              <ul
                aria-label={`Beneficios de ${plan.nombre}`}
                className="plan-benefits"
              >
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
                  {textoBoton}
                </a>
              ) : (
                <button
                  className="submit-button plan-submit"
                  onClick={() => setPlanSeleccionado(plan.nombre)}
                  type="button"
                >
                  {textoBoton}
                </button>
              )}
              {planSeleccionado === plan.nombre && !plan.enlacePago && (
                <p
                  aria-live="polite"
                  className="plan-payment-notice"
                  role="status"
                >
                  El pago se habilitará próximamente.
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
