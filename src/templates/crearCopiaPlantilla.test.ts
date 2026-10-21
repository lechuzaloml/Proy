import { describe, expect, it } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import { crearCopiaPlantilla } from "./crearCopiaPlantilla";

describe("crearCopiaPlantilla", () => {
  it("crea una copia independiente de toda la configuración", () => {
    const original = structuredClone(diagnosticoInicial);
    const copia = crearCopiaPlantilla("Plantilla de prueba", diagnosticoInicial);

    expect(copia.id).toMatch(/^personalizado-/);
    expect(copia.nombre).toBe("Copia de Plantilla de prueba");
    expect(copia.configuracion).toEqual(original);
    expect(copia.configuracion).not.toBe(diagnosticoInicial);

    const configuracionCopia = copia.configuracion;
    configuracionCopia.preguntas[0].texto = "Cambio solo en la copia";
    configuracionCopia.preguntas[0].opciones[0].texto = "Opción modificada";

    expect(diagnosticoInicial.preguntas[0].texto).toBe(
      original.preguntas[0].texto,
    );
    expect(diagnosticoInicial.preguntas[0].opciones[0].texto).toBe(
      original.preguntas[0].opciones[0].texto,
    );
  });

  it("genera un ID diferente para cada copia", () => {
    const primera = crearCopiaPlantilla("Plantilla", diagnosticoInicial);
    const segunda = crearCopiaPlantilla("Plantilla", diagnosticoInicial);

    expect(primera.id).not.toBe(segunda.id);
  });
});
