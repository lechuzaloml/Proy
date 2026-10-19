export type TipoPortada =
  | "imagenDerecha"
  | "imagenArriba"
  | "imagenFondoSuave";
export type TipoOpciones = "tarjetas" | "pildoras" | "filas";
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

export interface PresentacionTemplate {
  portada: TipoPortada;
  ilustracion: IlustracionTemplate;
  opciones: TipoOpciones;
  escala: TipoEscala;
  abierta: TipoAbierta;
}

export const porDefecto: PresentacionTemplate = {
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
    opciones: "tarjetas",
    escala: "segmentos",
    abierta: "compacta",
  },
  "demo-diagnostico-preparacion-comercial": {
    portada: "imagenFondoSuave",
    ilustracion: {
      tipo: "imagen",
      src: "/template-conversacion-comercial.png",
      alt: "Personas conversando frente a una computadora",
    },
    opciones: "filas",
    escala: "circulos",
    abierta: "compacta",
  },
  "demo-evaluacion-ciberseguridad": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "seguridad" },
    opciones: "tarjetas",
    escala: "circulos",
    abierta: "compacta",
  },
  "demo-evaluacion-liderazgo": {
    portada: "imagenDerecha",
    ilustracion: { tipo: "svg", icono: "liderazgo" },
    opciones: "pildoras",
    escala: "circulos",
    abierta: "amplia",
  },
  "demo-registro-masterclass": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "aprendizaje" },
    opciones: "pildoras",
    escala: "deslizador",
    abierta: "amplia",
  },
  "demo-onboarding-para-agencia": {
    portada: "imagenFondoSuave",
    ilustracion: {
      tipo: "imagen",
      src: "/template-descubrimiento-marketing.png",
      alt: "Personas revisando un proyecto de marketing",
    },
    opciones: "filas",
    escala: "segmentos",
    abierta: "amplia",
  },
  "demo-test-madurez-marketing-digital": {
    portada: "imagenDerecha",
    ilustracion: {
      tipo: "imagen",
      src: "/template-practicas-marketing.png",
      alt: "Métricas de redes sociales en un teléfono",
    },
    opciones: "tarjetas",
    escala: "deslizador",
    abierta: "compacta",
  },
  "demo-encuesta-habitos-intereses-financieros": {
    portada: "imagenFondoSuave",
    ilustracion: { tipo: "svg", icono: "finanzas" },
    opciones: "filas",
    escala: "deslizador",
    abierta: "amplia",
  },
};

export function obtenerPresentacionTemplate(
  cuestionarioId: string,
): PresentacionTemplate {
  return presentacionesTemplates[cuestionarioId] ?? porDefecto;
}
