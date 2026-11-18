import { describe, expect, it } from "vitest";
import {
  configuracionSitio,
  debeMostrarEncabezado,
  obtenerAnioActual,
  obtenerTipoPie,
  textoDerechosAutor,
} from "./sitio";

describe("configuración de presentación del sitio", () => {
  it("mantiene el wordmark y la navegación provisional solicitada", () => {
    expect(configuracionSitio.provisional).toBe(true);
    expect(configuracionSitio.nombreSitio).toBe("merkatics-ClearIa");
    expect(configuracionSitio.navegacion.map(({ etiqueta }) => etiqueta)).toEqual([
      "Inicio",
      "Biblioteca",
      "Probar gratis",
      "Acceder",
    ]);
  });

  it("genera el año y la barra de derechos a partir de la fecha recibida", () => {
    const fecha = new Date(2031, 0, 1);
    expect(obtenerAnioActual(fecha)).toBe(2031);
    expect(textoDerechosAutor(obtenerAnioActual(fecha))).toBe(
      "© 2031 Merkatics. Todos los derechos reservados.",
    );
  });

  it("excluye las páginas de evento y de empresa, y deja un pie mínimo en admin", () => {
    expect(debeMostrarEncabezado("/", true)).toBe(false);
    expect(obtenerTipoPie("/", true)).toBe("ninguno");
    expect(debeMostrarEncabezado("/c/empresa/cuestionario")).toBe(false);
    expect(obtenerTipoPie("/c/empresa/cuestionario")).toBe("ninguno");
    expect(debeMostrarEncabezado("/admin/plataforma")).toBe(false);
    expect(obtenerTipoPie("/admin/plataforma")).toBe("minimo");
    expect(debeMostrarEncabezado("/suscripcion")).toBe(true);
    expect(obtenerTipoPie("/")).toBe("completo");
  });
});
