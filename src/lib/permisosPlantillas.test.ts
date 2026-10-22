import { describe, expect, it } from "vitest";
import { puedeCrearCopiasPlantilla } from "./permisosPlantillas";

describe("puedeCrearCopiasPlantilla", () => {
  it("deniega a visitantes sin sesión", () => {
    expect(puedeCrearCopiasPlantilla(null, false, "clearia", [])).toBe(false);
  });

  it("permite a un miembro activo con permiso editarCuestionarios", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "editor@example.test", correoVerificado: true },
      false,
      "clearia",
      [{
        empresaId: "clearia",
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
      "clearia",
      [{
        empresaId: "clearia",
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
      "clearia",
      [],
    )).toBe(false);
  });

  it("deniega al administrador de otra empresa si no tiene membresía en clearia", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "admin@example.test", correoVerificado: true },
      false,
      "clearia",
      [{
        empresaId: "otra-empresa",
        correo: "admin@example.test",
        estado: "activo",
        rol: "admin",
        permisos: {},
      }],
    )).toBe(false);
  });

  it("permite al administrador de clearia por la membresía de esa empresa", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "admin@example.test", correoVerificado: true },
      false,
      "clearia",
      [{
        empresaId: "clearia",
        correo: "admin@example.test",
        estado: "activo",
        rol: "admin",
        permisos: {},
      }],
    )).toBe(true);
  });

  it("mantiene el permiso explícito de plataforma reconocido por las reglas", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "plataforma@example.test", correoVerificado: true },
      true,
      "clearia",
      [],
    )).toBe(true);
  });
});
