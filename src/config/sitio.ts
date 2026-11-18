export type AccionSitio =
  | "inicio"
  | "biblioteca"
  | "suscripcion"
  | "admin";

type EnlacePie =
  | { etiqueta: string; href: string; accion: AccionSitio }
  | { etiqueta: string; dialogo: "privacidad" | "terminos" };

interface ColumnaPie {
  titulo: string;
  enlaces: EnlacePie[];
}

interface ConfiguracionSitio {
  provisional: boolean;
  nombreSitio: string;
  navegacion: {
    etiqueta: string;
    href: string;
    accion: AccionSitio;
  }[];
  pie: {
    frase: string;
    columnas: ColumnaPie[];
    contacto: { correo: string; telefono: string };
    mostrarAvisoPagosPrueba: boolean;
  };
}

export const configuracionSitio: ConfiguracionSitio = {
  provisional: true,
  nombreSitio: "merkatics-ClearIa",
  navegacion: [
    { etiqueta: "Inicio", href: "/", accion: "inicio" },
    { etiqueta: "Biblioteca", href: "/", accion: "biblioteca" },
    { etiqueta: "Probar gratis", href: "/suscripcion", accion: "suscripcion" },
    { etiqueta: "Acceder", href: "/admin", accion: "admin" },
  ],
  pie: {
    frase: "Diagnósticos y recursos para impulsar el crecimiento de tu negocio.",
    columnas: [
      {
        titulo: "Producto",
        enlaces: [
          { etiqueta: "Biblioteca", href: "/", accion: "biblioteca" },
          {
            etiqueta: "Probar gratis",
            href: "/suscripcion",
            accion: "suscripcion",
          },
          { etiqueta: "Planes", href: "/suscripcion", accion: "suscripcion" },
        ],
      },
      {
        titulo: "Legal",
        enlaces: [
          { etiqueta: "Aviso de privacidad", dialogo: "privacidad" },
          { etiqueta: "Términos de uso", dialogo: "terminos" },
        ],
      },
    ],
    contacto: {
      correo: "",
      telefono: "",
    },
    mostrarAvisoPagosPrueba: true,
  },
};

export function obtenerAnioActual(fecha: Date = new Date()): number {
  return fecha.getFullYear();
}

export function textoDerechosAutor(anio: number = obtenerAnioActual()): string {
  return `© ${anio} Merkatics. Todos los derechos reservados.`;
}

export function obtenerTipoPie(
  pathname: string,
  esRegistroEvento = false,
): "completo" | "minimo" | "ninguno" {
  const ruta = pathname.replace(/\/+$/, "") || "/";
  if (
    esRegistroEvento ||
    ruta === "/c" ||
    ruta.startsWith("/c/") ||
    ruta === "/e" ||
    ruta.startsWith("/e/")
  ) {
    return "ninguno";
  }
  if (ruta === "/admin" || ruta.startsWith("/admin/")) {
    return "minimo";
  }
  return "completo";
}

export function debeMostrarEncabezado(
  pathname: string,
  esRegistroEvento = false,
): boolean {
  return obtenerTipoPie(pathname, esRegistroEvento) !== "ninguno";
}
