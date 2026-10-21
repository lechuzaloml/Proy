import { describe, expect, it } from "vitest";
import {
  normalizarCorreoEmpresa,
  normalizarUrlLogo,
  validarMarcaEmpresa,
  validarSlugEmpresa,
} from "./validacionesEmpresa";

describe("validarSlugEmpresa", () => {
  it("acepta slug lowercase con longitud permitida", () => {
    expect(validarSlugEmpresa("demo-a")).toBe(true);
    expect(validarSlugEmpresa(`a${"b".repeat(38)}z`)).toBe(true);
  });

  it("rechaza longitud inválida, mayúsculas y slugs reservados", () => {
    for (const slug of ["ab", "a".repeat(41), "Demo-a", "admin", "login"]) {
      expect(validarSlugEmpresa(slug)).toBe(false);
    }
  });
});

describe("normalizarCorreoEmpresa", () => {
  it("valida y normaliza correo", () => {
    expect(normalizarCorreoEmpresa(" Admin@Example.COM ")).toBe(
      "admin@example.com",
    );
    expect(normalizarCorreoEmpresa("correo-invalido")).toBeNull();
  });
});

describe("validarMarcaEmpresa", () => {
  it("acepta color hex y logo HTTPS de hasta 300 caracteres", () => {
    expect(validarMarcaEmpresa({
      colorPrimario: "#aBc123",
      logoUrl: "https://example.com/logo.png",
    })).toBe(true);
    expect(validarMarcaEmpresa({ colorPrimario: "#E2554F" })).toBe(true);
  });

  it("rechaza colores, protocolos y longitudes no permitidos", () => {
    expect(validarMarcaEmpresa({ colorPrimario: "red" })).toBe(false);
    expect(validarMarcaEmpresa({
      colorPrimario: "#123456",
      logoUrl: "http://example.com/logo.png",
    })).toBe(false);
    expect(validarMarcaEmpresa({
      colorPrimario: "#123456",
      logoUrl: `https://example.com/${"a".repeat(300)}`,
    })).toBe(false);
  });
});

describe("normalizarUrlLogo", () => {
  it("no devuelve URL insegura", () => {
    expect(normalizarUrlLogo("javascript:alert(1)")).toBeNull();
    expect(normalizarUrlLogo("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png",
    );
  });
});
