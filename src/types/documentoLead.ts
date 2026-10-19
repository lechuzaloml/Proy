import type { FieldValue, Timestamp } from "firebase/firestore";

export interface DocumentoLead {
  nombre: string;
  correo: string;
  telefono: string;
  consentimiento: {
    aceptado: true;
    version: string;
    fecha: FieldValue | Timestamp;
  };
  cuestionarioId: string;
  respuestas: Record<string, string>;
  puntaje: number;
  segmento: string;
  templateRecomendadoId: string;
  planRecomendado: string;
  estado: "nuevo";
  creadoEn: FieldValue | Timestamp;
}
