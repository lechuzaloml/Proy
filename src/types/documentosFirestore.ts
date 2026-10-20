import type { FieldValue, Timestamp } from "firebase/firestore";

export type MarcaTiempoFirestore = FieldValue | Timestamp;

export interface DocumentoLeadEmpresa {
  nombre: string;
  correo: string;
  telefono: string;
  consentimiento: {
    aceptado: true;
    version: string;
    fecha: MarcaTiempoFirestore;
  };
  origen: string;
  estado: "nuevo" | "contactado" | "interesado" | "convertido" | "descartado";
  ultimaActividadEn: MarcaTiempoFirestore;
  ultimoDiagnosticoId: string;
  ultimoPorcentaje?: number;
  ultimoSegmento?: string;
  creadoEn: MarcaTiempoFirestore;
}

export interface RespuestaDiagnostico {
  pregunta: string;
  tipo: "opcion_multiple" | "escala" | "abierta";
  seccion?: string;
  valor: string | number;
  valorLegible: string;
}

export interface DocumentoDiagnostico {
  leadId: string;
  cuestionarioId: string;
  versionId: string;
  respuestas: Record<string, RespuestaDiagnostico>;
  puntajeTotal: number;
  puntajeMaximo: number;
  porcentaje: number;
  segmento: string;
  puntajePorDimension: Record<string, number>;
  templateRecomendadoId?: string;
  planRecomendadoId?: string;
  completadoEn: MarcaTiempoFirestore;
}
