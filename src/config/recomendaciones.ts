import type { PlanSuscripcionId } from "./planes";

export type EstadoBeneficio = "disponible" | "proximamente";

export interface BeneficioPlan {
  texto: string;
  estado: EstadoBeneficio;
}

const notaPrecio =
  "Precio de prueba: 1 USD. Los valores son provisionales.";

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
    estado: "disponible",
  },
  {
    texto: "Conexión con el CRM y WhatsApp de Merkatics",
    estado: "proximamente",
  },
  {
    texto: "Personalización de tus propios cuestionarios",
    estado: "disponible",
  },
];

export interface PlanRecomendado {
  planId: PlanSuscripcionId;
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
      planId: "inicial",
      nombre: "Plan Inicial",
      precio: "1 USD / mes",
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
      planId: "pro",
      nombre: "Plan Pro",
      precio: "1 USD / mes",
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
      planId: "avanzado",
      nombre: "Plan Avanzado",
      precio: "1 USD / mes",
      notaPrecio,
      beneficios,
      textoBoton: "Suscribirme al Plan Avanzado",
      enlacePago: "",
    },
  },
};
