import { describe, expect, it } from "vitest";
import {
  puedeBorrarBorrador,
  puedeEditarBorrador,
  puedePublicar,
} from "./permisosCuestionarios";

describe("permisos de cuestionarios", () => {
  it.each(["admin", "propietario", "plataforma"] as const)(
    "%s puede publicar y administrar cualquier borrador",
    (rol) => {
      expect(puedePublicar(rol, {})).toBe(true);
      expect(puedeEditarBorrador(rol, {}, "otra@example.invalid", "yo@example.invalid"))
        .toBe(true);
      expect(puedeBorrarBorrador(rol, {}, "otra@example.invalid", "yo@example.invalid"))
        .toBe(true);
    },
  );

  it("un usuario con solo editar puede editar y borrar únicamente su borrador", () => {
    const permisos = { editarCuestionarios: true };
    expect(puedePublicar("usuario", permisos)).toBe(false);
    expect(puedeEditarBorrador(
      "usuario",
      permisos,
      "Editor@Example.Invalid",
      "editor@example.invalid",
    )).toBe(true);
    expect(puedeBorrarBorrador(
      "usuario",
      permisos,
      "editor@example.invalid",
      "otra@example.invalid",
    )).toBe(false);
  });

  it("un usuario con editar y publicar puede publicar, pero no editar borradores ajenos", () => {
    const permisos = {
      editarCuestionarios: true,
      publicarCuestionarios: true,
    };
    expect(puedePublicar("usuario", permisos)).toBe(true);
    expect(puedeEditarBorrador(
      "usuario",
      permisos,
      "otra@example.invalid",
      "editor@example.invalid",
    )).toBe(false);
  });

  it("no da permisos a un usuario sin permiso de edición ni al comparar correos vacíos", () => {
    expect(puedeEditarBorrador(
      "usuario",
      {},
      "editor@example.invalid",
      "editor@example.invalid",
    )).toBe(false);
    expect(puedeEditarBorrador("usuario", { editarCuestionarios: true }, "", "")).toBe(false);
    expect(puedeBorrarBorrador("usuario", {}, "editor@example.invalid", "editor@example.invalid"))
      .toBe(false);
  });
});
