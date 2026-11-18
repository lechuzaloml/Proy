import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import AccesoCuenta from "./AccesoCuenta";

vi.mock("../lib/firebaseAuth", () => ({ auth: {} }));

describe("control de cuenta compacto del encabezado", () => {
  it("muestra cerrar sesión sin revelar el correo", () => {
    const usuario = {
      uid: "usuario-1",
      email: "persona@example.com",
      emailVerified: true,
    } as User;
    const markup = renderToStaticMarkup(createElement(AccesoCuenta, {
      authListo: true,
      compacto: true,
      usuario,
    }));

    expect(markup).toContain("Cerrar sesión");
    expect(markup).not.toContain("persona@example.com");
  });

  it("muestra el acceso desde el encabezado cuando no hay sesión", () => {
    const markup = renderToStaticMarkup(createElement(AccesoCuenta, {
      authListo: true,
      compacto: true,
      usuario: null,
    }));

    expect(markup).toContain("Iniciar sesión");
  });
});
