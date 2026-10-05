export type TipoPregunta = "opcion_multiple" | "escala" | "abierta";

export type Seccion = string;

export interface Opcion {
  texto: string;
  puntos?: number;
}

interface PreguntaBase {
  id: string;
  seccion?: Seccion;
  texto: string;
  participa_scoring: boolean;
}

export interface PreguntaOpcionMultiple extends PreguntaBase {
  tipo: "opcion_multiple";
  opciones: Opcion[];
}

export interface PreguntaEscala extends PreguntaBase {
  tipo: "escala";
  escala: {
    min: number;
    max: number;
    etiqueta_min?: string;
    etiqueta_max?: string;
  };
  puntos_por_valor?: Record<string, number>;
}

export interface PreguntaAbierta extends PreguntaBase {
  tipo: "abierta";
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

export interface ResultadoSegmento {
  segmento: string;
  contenido: string;
  cta?: CTA;
}

export interface ResultadoPorSegmento {
  tipo: "por_segmento";
  resultados: ResultadoSegmento[];
}

export type Resultado = ResultadoFijo | ResultadoPorSegmento;

interface CuestionarioBase {
  id: string;
  cliente: string;
  estado: string;
  posicion_contacto: "inicio" | "final";
  secciones: Seccion[];
  preguntas: Pregunta[];
}

export interface CuestionarioSinScoring extends CuestionarioBase {
  usa_scoring: false;
  reglas_scoring?: never;
  resultado: ResultadoFijo;
}

export interface CuestionarioConScoring extends CuestionarioBase {
  usa_scoring: true;
  reglas_scoring: ReglaScoring[];
  resultado: ResultadoPorSegmento;
}

export type Cuestionario = CuestionarioSinScoring | CuestionarioConScoring;