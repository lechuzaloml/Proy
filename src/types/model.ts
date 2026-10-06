export type Seccion = string;

export interface Opcion {
  texto: string;
  puntos?: number;
}

export interface PreguntaOpcionMultiple {
  id: string;
  seccion?: Seccion;
  texto: string;
  tipo: "opcion_multiple";
  opciones: Opcion[];
  participa_scoring: boolean;
}

export interface PreguntaEscala {
  id: string;
  seccion?: Seccion;
  texto: string;
  tipo: "escala";
  escala: {
    min: number;
    max: number;
    etiqueta_min?: string;
    etiqueta_max?: string;
  };
  participa_scoring: boolean;
  puntos_por_valor?: Record<string, number>;
}

export interface PreguntaAbierta {
  id: string;
  seccion?: Seccion;
  texto: string;
  tipo: "abierta";
  participa_scoring: boolean;
  limite_caracteres?: number;
}

export type Pregunta =
  | PreguntaOpcionMultiple
  | PreguntaEscala
  | PreguntaAbierta;

export interface ReglaScoring {
  puntaje_min: number;
  puntaje_max: number;
  segmento: string;
}

export interface CTA {
  texto: string;
  accion: string;
}

export interface ResultadoFijo {
  tipo: "fijo";
  contenido: string;
  cta?: CTA;
}

export interface ResultadoPorSegmento {
  tipo: "por_segmento";
  resultados: {
    segmento: string;
    contenido: string;
    cta?: CTA;
  }[];
}

export type Resultado = ResultadoFijo | ResultadoPorSegmento;

interface CuestionarioBase {
  id: string;
  cliente: string;
  estado: string;
  posicion_contacto: "inicio" | "final";
  secciones?: Seccion[];
  preguntas: Pregunta[];
  landingTitulo?: string;
  landingDescripcion?: string;
}

export type Cuestionario = CuestionarioBase &
  (
    | {
        usa_scoring: true;
        reglas_scoring: ReglaScoring[];
        resultado: ResultadoPorSegmento;
      }
    | {
        usa_scoring: false;
        resultado: ResultadoFijo;
      }
  );

export interface Lead {
  cuestionarioId: string;
  nombre: string;
  correo: string;
  telefono: string;
  respuestas: Record<string, unknown>;
}
