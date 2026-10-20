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

  it("asigna un solo estilo de familia y no repite estilos entre templates", () => {
    const estilos = Object.values(presentacionesTemplates).map(
      (presentacion) => {
        const clavesEstilo = ["opciones", "escala", "abierta"].filter(
          (clave) => clave in presentacion,
        );
        expect(clavesEstilo).toHaveLength(1);
        switch (presentacion.familia) {
          case "si_no":
          case "opcion_multiple":
            return `${presentacion.familia}|${presentacion.opciones}`;
          case "escala":
            return `${presentacion.familia}|${presentacion.escala}`;
          case "abierta":
            return `${presentacion.familia}|${presentacion.abierta}`;
        }
      },
    );

    expect(new Set(estilos).size).toBe(8);
  });

  it("usa la configuración por defecto para IDs sin entrada", () => {
    expect(obtenerPresentacionTemplate("template-futuro")).toBe(porDefecto);
  });
});
