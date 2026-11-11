import type { PlanRecomendado } from "../config/recomendaciones";
import { limiteDePlan } from "../config/planes";

interface PantallaPlanesProps {
  planes: PlanRecomendado[];
  planRecomendadoNombre: string;
}

export default function PantallaPlanes({
  planes,
  planRecomendadoNombre,
}: PantallaPlanesProps) {
  return (
    <main className="plans-page">
      <header className="landing-brand">
        <img
          alt=""
          aria-hidden="true"
          className="landing-brand-mark"
          src="/merkatic-brand-mark.png"
        />
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
          const limite = limiteDePlan(plan.planId);
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
              <p>
                Cuestionarios publicados: hasta {limite} por empresa
              </p>

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
                      {beneficio.estado === "disponible" && (
                        <svg
                          aria-hidden="true"
                          className="benefit-status-icon"
                          fill="none"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="m5 12 4.5 4.5L19 7" />
                        </svg>
                      )}
                      {beneficio.estado === "disponible"
                        ? "Disponible"
                        : "Próximamente"}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                className="submit-button plan-submit"
                href={`/suscripcion?plan=${plan.planId}`}
              >
                Elegir {plan.nombre}
              </a>
            </article>
          );
        })}
      </section>
    </main>
  );
}
