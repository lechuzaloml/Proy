import { describe, expect, it } from "vitest";
import { puedeCrearCopiasPlantilla } from "./permisosPlantillas";

describe("puedeCrearCopiasPlantilla", () => {
  it("deniega a visitantes sin sesión", () => {
    expect(puedeCrearCopiasPlantilla(null, false, [])).toBe(false);
  });

  it("permite a un miembro activo con permiso editarCuestionarios", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "editor@example.test", correoVerificado: true },
      false,
      [{
        correo: "editor@example.test",
        estado: "activo",
        rol: "usuario",
        permisos: { editarCuestionarios: true },
      }],
    )).toBe(true);
  });

  it("deniega a una sesión sin permiso de edición", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "lector@example.test", correoVerificado: true },
      false,
      [{
        correo: "lector@example.test",
        estado: "activo",
        rol: "usuario",
        permisos: { verLeads: true },
      }],
    )).toBe(false);
  });

  it("deniega si la cuenta no verificó su correo aunque figure como admin", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "admin@example.test", correoVerificado: false },
      true,
      [],
    )).toBe(false);
  });
});
