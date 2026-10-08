export type EstadoBeneficio = "disponible" | "proximamente";

export interface BeneficioPlan {
  texto: string;
  estado: EstadoBeneficio;
}

const notaPrecio =
  "Precio de ejemplo para esta demostración; pendiente de definición.";

const beneficios: BeneficioPlan[] = [
  {
    texto: "Biblioteca de templates de diagnóstico (8 disponibles)",
    estado: "disponible",
  },
  {
    texto: "Cuestionarios con puntaje y resultado personalizado por segmento",
    estado: "disponible",
  },
  {
    texto: "Captura de datos de contacto de tus prospectos",
    estado: "disponible",
  },
  {
    texto: "Almacenamiento y panel de tus leads",
    estado: "proximamente",
  },
  {
    texto: "Conexión con el CRM y WhatsApp de Merkatics",
    estado: "proximamente",
  },
  {
    texto: "Personalización de tus propios cuestionarios",
    estado: "proximamente",
  },
];

export interface PlanRecomendado {
  nombre: string;
  precio: string;
  notaPrecio: string;
  beneficios: BeneficioPlan[];
  textoBoton: string;
  enlacePago?: string;
}

export interface RecomendacionDiagnostico {
  templateRecomendadoId: string;
  plan: PlanRecomendado;
}

export const recomendaciones: Record<string, RecomendacionDiagnostico> = {
  proceso_por_construir: {
    templateRecomendadoId:
      "../../templates/forms/onboarding-para-agencia.json",
    plan: {
      nombre: "Plan Inicial",
      precio: "$19 USD / mes",
      notaPrecio,
      beneficios,
      textoBoton: "Suscribirme al Plan Inicial",
      enlacePago: "",
    },
  },
  proceso_en_consolidacion: {
    templateRecomendadoId:
      "../../templates/quizzes/test-madurez-marketing-digital.json",
    plan: {
      nombre: "Plan Pro",
      precio: "$49 USD / mes",
      notaPrecio,
      beneficios,
      textoBoton: "Suscribirme al Plan Pro",
      enlacePago: "",
    },
  },
  proceso_preparado_para_crecer: {
    templateRecomendadoId:
      "../../templates/assessments/diagnostico-preparacion-comercial.json",
    plan: {
      nombre: "Plan Avanzado",
      precio: "$99 USD / mes",
      notaPrecio,
      beneficios,
      textoBoton: "Suscribirme al Plan Avanzado",
      enlacePago: "",
    },
  },
};
