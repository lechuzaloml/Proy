import { describe, expect, it } from "vitest";
import { catalogoTemplates } from "../templates/catalogo";
import {
  obtenerPresentacionTemplate,
  porDefecto,
  presentacionesTemplates,
} from "./presentacionTemplates";

describe("presentacionesTemplates", () => {
  it("incluye una configuración para cada template de biblioteca", () => {
    const idsCatalogo = catalogoTemplates.map((template) => {
      const cuestionario: unknown = template.configuracion;
      if (
        typeof cuestionario !== "object" ||
        cuestionario === null ||
        !("id" in cuestionario) ||
        typeof cuestionario.id !== "string"
      ) {
        throw new Error("El catálogo debe contener IDs de cuestionario válidos.");
      }
      return cuestionario.id;
    });

    expect(idsCatalogo).toHaveLength(8);
    expect(Object.keys(presentacionesTemplates).sort()).toEqual(
      [...idsCatalogo].sort(),
    );
  });

  it("asigna combinaciones de presentación únicas a los ocho templates", () => {
    const combinaciones = Object.values(presentacionesTemplates).map(
      ({ opciones, escala, abierta }) =>
        [opciones, escala, abierta].join("|"),
    );

    expect(new Set(combinaciones).size).toBe(8);
  });

  it("usa la configuración por defecto para IDs sin entrada", () => {
    expect(obtenerPresentacionTemplate("template-futuro")).toBe(porDefecto);
  });
});
