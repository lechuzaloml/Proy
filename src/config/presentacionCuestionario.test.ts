import { describe, expect, it } from "vitest";
import {
  contarPreguntas,
  crearPasosCuestionario,
  estimarMinutos,
} from "./presentacionCuestionario";

describe("presentacionCuestionario", () => {
  it("cuenta las preguntas del cuestionario", () => {
    expect(contarPreguntas([])).toBe(0);
    expect(contarPreguntas(["una", "dos", "tres"])).toBe(3);
  });

  it("estima un minuto por cada tres preguntas o fracción, mínimo uno", () => {
    expect(estimarMinutos(0)).toBe(1);
    expect(estimarMinutos(1)).toBe(1);
    expect(estimarMinutos(3)).toBe(1);
    expect(estimarMinutos(4)).toBe(2);
    expect(estimarMinutos(7)).toBe(3);
  });

  it("ordena los pasos con los datos al inicio y respeta si hay puntaje", () => {
    expect(crearPasosCuestionario("inicio", true)).toEqual([
      "Tus datos",
      "Las preguntas",
      "Tu resultado",
    ]);
    expect(crearPasosCuestionario("inicio", false)).toEqual([
      "Tus datos",
      "Las preguntas",
      "Confirmación",
    ]);
  });

  it("ordena los pasos con los datos al final y respeta si hay puntaje", () => {
    expect(crearPasosCuestionario("final", true)).toEqual([
      "Las preguntas",
      "Tus datos",
      "Tu resultado",
    ]);
    expect(crearPasosCuestionario("final", false)).toEqual([
      "Las preguntas",
      "Tus datos",
      "Confirmación",
    ]);
  });
});
