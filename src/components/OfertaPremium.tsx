const beneficiosPremium = [
  {
    estado: "Disponible",
    titulo: "Biblioteca de diagnósticos",
    descripcion:
      "Acceso a ocho templates demostrativos para distintos objetivos de negocio.",
  },
  {
    estado: "Disponible",
    titulo: "Resultados por segmento",
    descripcion:
      "Cuestionarios con puntaje y un resultado personalizado según las respuestas.",
  },
  {
    estado: "Disponible",
    titulo: "Captura de prospectos",
    descripcion:
      "Recopilación de datos de contacto como parte del flujo del cuestionario.",
  },
];

const beneficiosProximos = [
  "Almacenamiento y panel de leads",
  "Conexión con CRM y WhatsApp de Merkatics",
  "Personalización de cuestionarios",
];

export default function OfertaPremium() {
  return (
    <section
      aria-labelledby="premium-offer-title"
      className="landing-section landing-premium"
    >
      <header className="landing-section-heading">
        <p className="landing-kicker">Clear-IA Premium</p>
        <h2 id="premium-offer-title">¿Qué ofrecemos como Premium?</h2>
        <p>
          Recursos para ofrecer cuestionarios de diagnóstico, comprender las
          respuestas y conocer mejor a tus prospectos.
        </p>
      </header>

      <div className="landing-premium-grid">
        {beneficiosPremium.map((beneficio) => (
          <article className="landing-premium-item" key={beneficio.titulo}>
            <p className="landing-premium-status">{beneficio.estado}</p>
            <h3>{beneficio.titulo}</h3>
            <p>{beneficio.descripcion}</p>
          </article>
        ))}
      </div>

      <div className="landing-coming-soon">
        <p className="landing-premium-label">Próximamente</p>
        <ul>
          {beneficiosProximos.map((beneficio) => (
            <li key={beneficio}>{beneficio}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
