import type { MetadataTemplate } from "../templates/catalogo";

interface PantallaInicioTemplateProps {
  templateId: string;
  template: MetadataTemplate;
  origen: "biblioteca" | "recomendacion";
  onComenzar: () => void;
}

const portadas: Record<
  string,
  { imagen: string; descripcion: string }
> = {
  "../../templates/forms/onboarding-para-agencia.json": {
    imagen: "/template-descubrimiento-marketing.png",
    descripcion:
      "Cuéntanos sobre tu negocio, tus objetivos y el alcance que buscas para tu proyecto de marketing.",
  },
  "../../templates/quizzes/test-madurez-marketing-digital.json": {
    imagen: "/template-practicas-marketing.png",
    descripcion:
      "Revisa tus prácticas de planificación, audiencia y medición en marketing digital.",
  },
  "../../templates/assessments/diagnostico-preparacion-comercial.json": {
    imagen: "/template-conversacion-comercial.png",
    descripcion:
      "Identifica tu necesidad, prioridad y próximos pasos para una conversación comercial.",
  },
};

const portadasGraficas: Record<
  string,
  { tema: string; etiqueta: string; conceptos: string[]; descripcion: string }
> = {
  "../../templates/assessments/evaluacion-ciberseguridad.json": {
    tema: "ciberseguridad",
    etiqueta: "Seguridad digital",
    conceptos: ["Accesos", "Equipo", "Respuesta"],
    descripcion:
      "Reflexiona sobre prácticas cotidianas de acceso, autenticación y preparación de tu equipo.",
  },
  "../../templates/surveys/diagnostico-salud-financiera.json": {
    tema: "finanzas",
    etiqueta: "Hábitos financieros",
    conceptos: ["Organización", "Objetivos", "Aprendizaje"],
    descripcion:
      "Explora tus hábitos, intereses y objetivos de organización financiera.",
  },
  "../../templates/assessments/evaluacion-liderazgo.json": {
    tema: "liderazgo",
    etiqueta: "Desarrollo de equipo",
    conceptos: ["Comunicación", "Delegación", "Crecimiento"],
    descripcion:
      "Una reflexión sobre comunicación, delegación y desarrollo de equipos.",
  },
  "../../templates/assessments/diagnostico-madurez-tecnologica.json": {
    tema: "madurez-digital",
    etiqueta: "Evolución digital",
    conceptos: ["Herramientas", "Permisos", "Adopción"],
    descripcion:
      "Revisa cómo tu organización selecciona y adopta herramientas digitales.",
  },
  "../../templates/events/registro-a-masterclass.json": {
    tema: "masterclass",
    etiqueta: "Aprendizaje en línea",
    conceptos: ["Conoce", "Aprende", "Participa"],
    descripcion:
      "Comparte tus intereses y lo que te gustaría obtener de una masterclass.",
  },
};

export function tienePortadaTemplate(templateId: string): boolean {
  return (
    Object.hasOwn(portadas, templateId) ||
    Object.hasOwn(portadasGraficas, templateId)
  );
}

export default function PantallaInicioTemplate({
  templateId,
  template,
  origen,
  onComenzar,
}: PantallaInicioTemplateProps) {
  const portada = portadas[templateId];
  const portadaGrafica = portadasGraficas[templateId];
  const descripcion = portada?.descripcion ??
    portadaGrafica?.descripcion ??
    `Explora este template de ${template.formato.toLocaleLowerCase("es")} para ${template.caso_uso.toLocaleLowerCase("es")} en ${template.nicho}.`;

  return (
    <main
      aria-labelledby="template-intro-title"
      className={`template-intro ${
        portadaGrafica
          ? `template-intro--graphic template-intro--${portadaGrafica.tema}`
          : "template-intro--photo"
      }`}
      style={
        portada ? { backgroundImage: `url("${portada.imagen}")` } : undefined
      }
    >
      <div className="template-intro-content">
        <p className="eyebrow">
          {origen === "recomendacion"
            ? "Cuestionario recomendado"
            : "Template demostrativo"}
        </p>
        <h1 id="template-intro-title">{template.nombre}</h1>
        <p className="template-intro-description">{descripcion}</p>
        <button
          className="template-intro-button"
          onClick={onComenzar}
          type="button"
        >
          Tomar quiz
        </button>
        <p className="template-intro-demo">
          Demostración: no se guardan datos.
        </p>
      </div>
      {portadaGrafica && (
        <div aria-hidden="true" className="template-intro-art">
          <div className="template-intro-art-orbit" />
          <div className="template-intro-art-panel">
            <span className="template-intro-art-label">
              {portadaGrafica.etiqueta}
            </span>
            {portadaGrafica.conceptos.map((concepto, indice) => (
              <div className="template-intro-art-row" key={concepto}>
                <span className="template-intro-art-number">
                  0{indice + 1}
                </span>
                <span className="template-intro-art-line">{concepto}</span>
                <span className="template-intro-art-dot" />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
