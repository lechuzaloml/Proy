interface LandingProps {
  titulo: string;
  descripcion: string;
  onComenzar: () => void;
}

export default function Landing({
  titulo,
  descripcion,
  onComenzar,
}: LandingProps) {
  return (
    <main className="questionnaire landing">
      <section className="landing-card">
        <p className="eyebrow">Bienvenido</p>
        <h1>{titulo}</h1>
        <p>{descripcion}</p>
        <button className="submit-button" onClick={onComenzar} type="button">
          Comenzar diagnóstico
        </button>
      </section>
    </main>
  );
}
