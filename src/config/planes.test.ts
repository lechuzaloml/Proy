import { describe, expect, it } from "vitest";
import {
  limiteDePlan,
  puedePublicarMas,
} from "./planes";

describe("límites de cuestionarios por plan", () => {
  it.each([
    ["inicial", 3],
    ["pro", 10],
    ["avanzado", 25],
    ["interno", Number.POSITIVE_INFINITY],
    ["desconocido", 3],
  ])("limiteDePlan(%s) devuelve %s", (planId, limite) => {
    expect(limiteDePlan(planId)).toBe(limite);
  });

  it("permite publicar solo mientras quede cupo", () => {
    expect(puedePublicarMas(2, 3)).toBe(true);
    expect(puedePublicarMas(3, 3)).toBe(false);
    expect(puedePublicarMas(100, Number.POSITIVE_INFINITY)).toBe(true);
  });
});
