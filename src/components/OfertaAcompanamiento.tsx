const etapasRuta = [
  {
    numero: "01",
    titulo: "Entender",
    descripcion: "Revisamos los hallazgos de tu diagnóstico.",
  },
  {
    numero: "02",
    titulo: "Priorizar",
    descripcion: "Elegimos las oportunidades más relevantes para tu negocio.",
  },
  {
    numero: "03",
    titulo: "Trazar",
    descripcion: "Definimos un siguiente paso claro y realista.",
  },
];

export default function OfertaAcompanamiento() {
  return (
    <section
      aria-labelledby="ruta-comercial-title"
      className="ruta-comercial"
    >
      <div className="ruta-comercial-copy">
        <p className="ruta-comercial-kicker">Acompañamiento comercial</p>
        <h2 id="ruta-comercial-title">
          Convierte tu diagnóstico en un siguiente paso claro
        </h2>
        <p className="ruta-comercial-description">
          Una propuesta de trabajo para revisar tus oportunidades comerciales,
          ordenar prioridades y definir por dónde avanzar.
        </p>
        <p className="ruta-comercial-note">
          Servicio independiente de la suscripción Clear-IA Premium. El alcance
          y las condiciones se acuerdan antes de iniciar.
        </p>
        <aside aria-label="Comunidad de WhatsApp" className="whatsapp-community">
          <span aria-hidden="true" className="whatsapp-community-icon">
            ◌
          </span>
          <div className="whatsapp-community-copy">
            <h3>Únete a la comunidad Clear-IA</h3>
            <p>
              Ideas, recursos y conversaciones para impulsar tu crecimiento.
            </p>
            <small>El acceso al grupo estará disponible próximamente.</small>
          </div>
          <button className="whatsapp-community-button" type="button">
            Unirme
            <span aria-hidden="true" className="whatsapp-community-arrow">
              <svg
                fill="none"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M4 12h15m-6-6 6 6-6 6" />
              </svg>
            </span>
          </button>
        </aside>
      </div>

      <aside aria-label="Etapas del acompañamiento" className="ruta-comercial-map">
        <div className="ruta-comercial-map-heading">
          <span>Ruta Clear-IA</span>
          <span aria-hidden="true">01 — 03</span>
        </div>
        <ol className="ruta-comercial-steps">
          {etapasRuta.map((etapa) => (
            <li className="ruta-comercial-step" key={etapa.numero}>
              <span aria-hidden="true" className="ruta-comercial-step-number">
                {etapa.numero}
              </span>
              <div>
                <h3>{etapa.titulo}</h3>
                <p>{etapa.descripcion}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="ruta-comercial-map-footer">
          Un punto de partida. Las acciones dependen del contexto de cada negocio.
        </p>
      </aside>
    </section>
  );
}
