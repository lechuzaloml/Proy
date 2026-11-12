import { describe, expect, it } from "vitest";
import {
  EMPRESAS_PROTEGIDAS,
  esEmpresaProtegida,
  puedeEliminar,
  validarSlugEmpresaId,
} from "./empresas";

describe("políticas de eliminación de empresas", () => {
  it("valida slugs y protege las rutas reservadas", () => {
    expect(validarSlugEmpresaId("empresa-demo")).toBe(true);
    expect(validarSlugEmpresaId("Empresa-demo")).toBe(false);
    expect(validarSlugEmpresaId("ab")).toBe(false);
    expect(validarSlugEmpresaId("clearia")).toBe(false);
    expect(esEmpresaProtegida("clearia")).toBe(true);
    expect(EMPRESAS_PROTEGIDAS).toContain("clearia");
  });

  it("solo permite eliminar empresas suspendidas o sin propietario activo", () => {
    expect(puedeEliminar("suspendida", true)).toBe(true);
    expect(puedeEliminar("activa", false)).toBe(true);
    expect(puedeEliminar("activa", true)).toBe(false);
  });
});
