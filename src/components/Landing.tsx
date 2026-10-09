interface LandingProps {
  onComenzar: () => void;
}

const retosNegocio = [
  {
    numero: "01",
    titulo: "Captación de oportunidades",
    paraQue:
      "Identifica si tu negocio atrae prospectos de manera clara y constante.",
  },
  {
    numero: "02",
    titulo: "Priorización de prospectos",
    paraQue:
      "Reconoce oportunidades para definir cuáles prospectos requieren atención primero.",
  },
  {
    numero: "03",
    titulo: "Seguimiento comercial",
    paraQue:
      "Detecta cómo dar continuidad a las conversaciones y avanzar cada oportunidad.",
  },
];

export default function Landing({ onComenzar }: LandingProps) {
  return (
    <main className="landing-page">
      <header className="landing-brand">
        <span className="landing-brand-mark" aria-hidden="true">
          C
        </span>
        <span>CLEAR-IA</span>
      </header>
      <section aria-labelledby="landing-title" className="landing-hero">
        <div className="landing-intro">
          <p className="landing-kicker">Una mirada clara a tu crecimiento</p>
          <h1 id="landing-title">
            Diagnostica el potencial de crecimiento de tu negocio
          </h1>
          <p className="landing-description">
            Responde un breve diagnóstico sobre tu negocio e identifica las
            principales áreas de oportunidad que pueden estar limitando su
            crecimiento.
          </p>
          <div className="landing-actions">
            <button
              className="submit-button"
              onClick={onComenzar}
              type="button"
            >
              Iniciar diagnóstico
              <span aria-hidden="true" className="landing-button-arrow">
                →
              </span>
            </button>
            <p className="landing-duration">
              <span aria-hidden="true" className="landing-duration-dot" />
              Aproximadamente 2–3 minutos
            </p>
          </div>
        </div>

        <aside
          aria-labelledby="landing-purpose-title"
          className="landing-purpose"
        >
          <p className="eyebrow">Tu punto de partida</p>
          <h2 id="landing-purpose-title">¿Qué podrás revisar?</h2>
          <p className="landing-purpose-intro">
            Una perspectiva práctica de cómo estás atrayendo y atendiendo
            oportunidades comerciales.
          </p>
          <ol>
            <li>
              <span className="landing-topic-number">01</span>
              <span>Generación de nuevas oportunidades</span>
            </li>
            <li>
              <span className="landing-topic-number">02</span>
              <span>Priorización de prospectos</span>
            </li>
            <li>
              <span className="landing-topic-number">03</span>
              <span>Seguimiento y avance comercial</span>
            </li>
          </ol>
          <div className="landing-outcome">
            <span className="landing-outcome-rule" aria-hidden="true" />
            <p>
              Al finalizar, recibirás una orientación inicial y recursos
              demostrativos relacionados con tus respuestas.
            </p>
          </div>
        </aside>
      </section>

      <section aria-labelledby="landing-problem-title" className="landing-problem">
        <div className="landing-problem-copy">
          <p className="landing-problem-kicker">El problema</p>
          <h2 id="landing-problem-title">
            El problema no es la falta de opciones.
          </h2>
          <p>
            Cuestionarios, evaluaciones, listas de espera, encuestas y
            seminarios web: hay muchas maneras de convertir la atención en
            acción.
          </p>
          <p>
            Lo difícil es saber cuál se adapta realmente a las necesidades de
            tu negocio en este momento.
          </p>
          <p>
            Adivinar, copiar un embudo ajeno o pasar demasiado tiempo comparando
            opciones puede llevarte a crear algo que no encaja — o a no empezar.
          </p>
        </div>

        <div
          aria-label="Opciones para conectar con prospectos"
          className="landing-options-visual"
          role="img"
        >
          <span className="landing-option-chip landing-option-forms">
            Formularios
          </span>
          <span className="landing-option-chip landing-option-webinars">
            Seminarios web
          </span>
          <span className="landing-option-chip landing-option-surveys">
            Encuestas
          </span>
          <span className="landing-option-chip landing-option-funnels">
            Embudos de cuestionarios
          </span>
          <span className="landing-option-chip landing-option-waitlists">
            Listas de espera
          </span>
          <span className="landing-option-chip landing-option-dashboards">
            Cuadros de mando
          </span>
          <div className="landing-profile">
            <div aria-hidden="true" className="landing-profile-avatar">
              <svg
                fill="none"
                role="presentation"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="32" cy="32" r="31" />
                <circle cx="32" cy="24" r="10" />
                <path d="M13 55c2.7-10 9.2-15 19-15s16.3 5 19 15" />
              </svg>
            </div>
            <span className="landing-profile-name">Tu negocio</span>
            <span className="landing-profile-role">En busca de crecimiento</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-solutions-title" className="landing-section">
        <header className="landing-section-heading">
          <p className="landing-kicker">Tres áreas para entender mejor</p>
          <h2 id="landing-solutions-title">
            ¿Qué puede ayudarte a resolver el diagnóstico?
          </h2>
          <p>
            Obtén una primera perspectiva de los aspectos que influyen en la
            gestión de tus oportunidades comerciales.
          </p>
        </header>

        <div className="landing-solution-grid">
          {retosNegocio.map((reto) => (
            <article className="landing-solution" key={reto.numero}>
              <span aria-hidden="true" className="landing-solution-number">
                {reto.numero}
              </span>
              <h3>{reto.titulo}</h3>
              <p className="landing-solution-label">¿Para qué?</p>
              <p>{reto.paraQue}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="landing-next-step-title" className="landing-next-step">
        <p className="landing-next-step-kicker">Tu próximo paso</p>
        <h2 id="landing-next-step-title">
          Deja de pensar demasiado en qué construir.
          <span> Identifiquemos el siguiente paso correcto.</span>
        </h2>
        <p className="landing-next-step-description">
          <strong>7 preguntas. Una orientación clara.</strong> Descubre qué áreas
          comerciales conviene atender primero para impulsar el crecimiento de
          tu negocio.
        </p>
        <button
          className="landing-next-step-button"
          onClick={onComenzar}
          type="button"
        >
          Iniciar diagnóstico
          <span aria-hidden="true">→</span>
        </button>
        <p className="landing-next-step-note">
          Toma aproximadamente 2–3 minutos.
        </p>
      </section>

    </main>
  );
}
