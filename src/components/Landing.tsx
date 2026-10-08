interface LandingProps {
  onComenzar: () => void;
}

export default function Landing({ onComenzar }: LandingProps) {
  return (
    <main className="questionnaire landing">
      <section className="landing-card">
        <p className="eyebrow">CLEAR-IA</p>
        <h1>Diagnostica el potencial de crecimiento de tu negocio</h1>
        <p className="landing-description">
          Responde un breve diagnóstico sobre tu negocio e identifica las
          principales áreas de oportunidad que pueden estar limitando su
          crecimiento.
        </p>
        <button className="submit-button" onClick={onComenzar} type="button">
          INICIAR DIAGNÓSTICO
        </button>
        <p className="landing-duration">
          Completarlo toma aproximadamente 2–3 minutos.
        </p>
      </section>
    </main>
  );
}
