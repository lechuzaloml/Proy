import { describe, expect, it } from "vitest";
import { puedeCrearCopiasPlantilla } from "./permisosPlantillas";

describe("puedeCrearCopiasPlantilla", () => {
  it("deniega a visitantes sin sesión", () => {
    expect(puedeCrearCopiasPlantilla(null, false, "demo-a", [])).toBe(false);
  });

  it("permite a un miembro activo con permiso editarCuestionarios", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "editor@example.test", correoVerificado: true },
      false,
      "demo-a",
      [{
        empresaId: "demo-a",
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
      "demo-a",
      [{
        empresaId: "demo-a",
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
      "demo-a",
      [],
    )).toBe(false);
  });

  it("permite al administrador de demo-a sin membresía en Clear-IA", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "admin@example.test", correoVerificado: true },
      false,
      "demo-a",
      [{
        empresaId: "demo-a",
        correo: "admin@example.test",
        estado: "activo",
        rol: "admin",
        permisos: {},
      }],
    )).toBe(true);
  });

  it("permite al propietario de una empresa crear copias sin permiso explícito", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "owner@example.test", correoVerificado: true },
      false,
      "demo-a",
      [{
        empresaId: "demo-a",
        correo: "owner@example.test",
        estado: "activo",
        rol: "propietario",
        permisos: {},
      }],
    )).toBe(true);
  });

  it("deniega al administrador de otra empresa si no tiene membresía en demo-a", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "admin@example.test", correoVerificado: true },
      false,
      "demo-a",
      [{
        empresaId: "otra-empresa",
        correo: "admin@example.test",
        estado: "activo",
        rol: "admin",
        permisos: {},
      }],
    )).toBe(false);
  });

  it("mantiene el permiso explícito de plataforma reconocido por las reglas", () => {
    expect(puedeCrearCopiasPlantilla(
      { correo: "plataforma@example.test", correoVerificado: true },
      true,
      "demo-a",
      [],
    )).toBe(true);
  });
});
