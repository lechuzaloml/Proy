import { describe, expect, it } from "vitest";
import {
  esAdministradorEmpresa,
  puedeBorrarMiembro,
  puedeEditarMiembro,
  rolesAsignablesPor,
} from "./rolesMiembros";

describe("rolesAsignablesPor", () => {
  it("permite al propietario asignar admins y usuarios", () => {
    expect(rolesAsignablesPor("propietario")).toEqual(["admin", "usuario"]);
  });

  it("permite al admin asignar solo usuarios", () => {
    expect(rolesAsignablesPor("admin")).toEqual(["usuario"]);
  });

  it("no permite asignaciones a un usuario", () => {
    expect(rolesAsignablesPor("usuario")).toEqual([]);
  });

  it("permite a plataforma asignar cualquier rol", () => {
    expect(rolesAsignablesPor(null, true)).toEqual([
      "propietario",
      "admin",
      "usuario",
    ]);
  });
});

describe("permisos de gestión de miembros", () => {
  it("considera administradores al propietario y al admin", () => {
    expect(esAdministradorEmpresa("propietario")).toBe(true);
    expect(esAdministradorEmpresa("admin")).toBe(true);
    expect(esAdministradorEmpresa("usuario")).toBe(false);
  });

  it("el propietario gestiona admins y usuarios, pero no propietarios ni a sí mismo", () => {
    for (const canManage of [puedeEditarMiembro, puedeBorrarMiembro]) {
      expect(canManage("propietario", "admin", false)).toBe(true);
      expect(canManage("propietario", "usuario", false)).toBe(true);
      expect(canManage("propietario", "propietario", false)).toBe(false);
      expect(canManage("propietario", "propietario", true)).toBe(false);
    }
  });

  it("el admin solo gestiona usuarios", () => {
    for (const canManage of [puedeEditarMiembro, puedeBorrarMiembro]) {
      expect(canManage("admin", "usuario", false)).toBe(true);
      expect(canManage("admin", "admin", false)).toBe(false);
      expect(canManage("admin", "propietario", false)).toBe(false);
      expect(canManage("admin", "admin", true)).toBe(false);
    }
  });

  it("un usuario no puede editar ni borrar miembros", () => {
    for (const canManage of [puedeEditarMiembro, puedeBorrarMiembro]) {
      expect(canManage("usuario", "usuario", false)).toBe(false);
      expect(canManage("usuario", "admin", false)).toBe(false);
      expect(canManage("usuario", "propietario", false)).toBe(false);
    }
  });

  it("plataforma puede gestionar cualquier miembro, incluso a sí misma", () => {
    for (const canManage of [puedeEditarMiembro, puedeBorrarMiembro]) {
      expect(canManage(null, "propietario", true, true)).toBe(true);
    }
  });
});
