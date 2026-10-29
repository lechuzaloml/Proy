export type Seccion = string;
export type EstiloVisualCuestionario =
  | "finanzas"
  | "ciberseguridad"
  | "liderazgo"
  | "madurez-digital"
  | "comercial"
  | "masterclass";

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

export interface BienvenidaCuestionario {
  habilitada?: boolean;
  titulo?: string;
  descripcion?: string;
  imagen?: string;
  tiempoEstimado?: string;
  textoBoton?: string;
}

export type Resultado = ResultadoFijo | ResultadoPorSegmento;

interface CuestionarioBase {
  id: string;
  cliente: string;
  estado: string;
  posicion_contacto: "inicio" | "final";
  personalizar_resultado_con_ia?: boolean;
  secciones?: Seccion[];
  preguntas: Pregunta[];
  estilo_visual?: EstiloVisualCuestionario;
  landingTitulo?: string;
  landingDescripcion?: string;
  bienvenida?: BienvenidaCuestionario;
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
