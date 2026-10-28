export type TipoPortada =
  | "imagenDerecha"
  | "imagenArriba"
  | "imagenFondoSuave";
export type TipoOpciones =
  | "tarjetas"
  | "pildoras"
  | "filas"
  | "siNoTarjetas"
  | "siNoPildoras";
export type TipoEscala = "circulos" | "segmentos" | "deslizador";
export type TipoAbierta = "amplia" | "compacta";

export type IlustracionTemplate =
  | { tipo: "imagen"; src: string; alt: string }
  | {
      tipo: "svg";
      icono:
        | "marketing"
        | "comercial"
        | "seguridad"
        | "liderazgo"
        | "aprendizaje"
        | "digital"
        | "finanzas";
    };

interface PresentacionBase {
  portada: TipoPortada;
  ilustracion: IlustracionTemplate;
}

export type PresentacionTemplate = PresentacionBase &
  (
    | {
        familia: "si_no";
        opciones: Extract<TipoOpciones, "siNoTarjetas" | "siNoPildoras">;
      }
    | {
        familia: "opcion_multiple";
        opciones: Extract<TipoOpciones, "tarjetas" | "pildoras" | "filas">;
      }
    | { familia: "escala"; escala: TipoEscala }
    | { familia: "abierta"; abierta: TipoAbierta }
  );

export interface PresentacionPorDefecto extends PresentacionBase {
  opciones: TipoOpciones;
  escala: TipoEscala;
  abierta: TipoAbierta;
}

export type Presentacion = PresentacionTemplate | PresentacionPorDefecto;

export const porDefecto: PresentacionPorDefecto = {
  portada: "imagenFondoSuave",
  ilustracion: { tipo: "svg", icono: "marketing" },
  opciones: "filas",
  escala: "deslizador",
  abierta: "compacta",
};

export const presentacionesTemplates: Record<string, PresentacionTemplate> = {
  "demo-evaluacion-madurez-practicas-digitales": {
    portada: "imagenDerecha",
    ilustracion: { tipo: "svg", icono: "digital" },
    familia: "escala",
    escala: "segmentos",
  },
  "demo-diagnostico-preparacion-comercial": {
    portada: "imagenFondoSuave",
    ilustracion: {
      tipo: "imagen",
      src: "/template-conversacion-comercial.png",
      alt: "Personas conversando frente a una computadora",
    },
    familia: "opcion_multiple",
    opciones: "filas",
  },
  "demo-evaluacion-ciberseguridad": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "seguridad" },
    familia: "si_no",
    opciones: "siNoTarjetas",
  },
  "demo-evaluacion-liderazgo": {
    portada: "imagenDerecha",
    ilustracion: { tipo: "svg", icono: "liderazgo" },
    familia: "escala",
    escala: "circulos",
  },
  "demo-registro-masterclass": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "aprendizaje" },
    familia: "opcion_multiple",
    opciones: "pildoras",
  },
  "demo-registro-evento-pagina-completa": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "aprendizaje" },
    familia: "opcion_multiple",
    opciones: "pildoras",
  },
  "demo-onboarding-para-agencia": {
    portada: "imagenFondoSuave",
    ilustracion: {
      tipo: "imagen",
      src: "/template-descubrimiento-marketing.png",
      alt: "Personas revisando un proyecto de marketing",
    },
    familia: "abierta",
    abierta: "amplia",
  },
  "demo-test-madurez-marketing-digital": {
    portada: "imagenDerecha",
    ilustracion: {
      tipo: "imagen",
      src: "/template-practicas-marketing.png",
      alt: "Métricas de redes sociales en un teléfono",
    },
    familia: "si_no",
    opciones: "siNoPildoras",
  },
  "demo-encuesta-habitos-intereses-financieros": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "finanzas" },
    familia: "opcion_multiple",
    opciones: "tarjetas",
  },
};

export function obtenerPresentacionTemplate(
  cuestionarioId: string,
): Presentacion {
  return presentacionesTemplates[cuestionarioId] ?? porDefecto;
}
