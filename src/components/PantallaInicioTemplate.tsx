import type { Cuestionario } from "../types/model";
import type { MetadataTemplate } from "../templates/catalogo";
import PantallaPreviaCuestionario from "./PantallaPreviaCuestionario";

interface PantallaInicioTemplateProps {
  templateId: string;
  template: MetadataTemplate;
  cuestionario: Cuestionario;
  onComenzar: () => void;
}

export function tienePortadaTemplate(templateId: string): boolean {
  const idsConPortada = new Set([
    "../../templates/forms/onboarding-para-agencia.json",
    "../../templates/quizzes/test-madurez-marketing-digital.json",
    "../../templates/assessments/diagnostico-preparacion-comercial.json",
    "../../templates/assessments/evaluacion-ciberseguridad.json",
    "../../templates/surveys/diagnostico-salud-financiera.json",
    "../../templates/assessments/evaluacion-liderazgo.json",
    "../../templates/assessments/diagnostico-madurez-tecnologica.json",
    "../../templates/events/registro-a-masterclass.json",
    "../../templates/events/registro-evento-pagina-completa.json",
  ]);
  return idsConPortada.has(templateId);
}

export default function PantallaInicioTemplate({
  templateId,
  template,
  cuestionario,
  onComenzar,
}: PantallaInicioTemplateProps) {
  return (
    <main aria-labelledby="questionnaire-intro-title">
      <PantallaPreviaCuestionario
        cuestionario={cuestionario}
        descripcion={template.descripcion}
        onComenzar={onComenzar}
        templateId={templateId}
        textoBoton="Comenzar cuestionario"
        requiereConsentimiento={false}
        titulo={template.nombre}
      />
    </main>
  );
}
