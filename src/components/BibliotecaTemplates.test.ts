import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BibliotecaTemplates from "./BibliotecaTemplates";
import type { TemplateCatalogo } from "../templates/catalogo";

const templates: TemplateCatalogo[] = [{
  id: "template-prueba",
  metadata: {
    nombre: "Template de prueba",
    formato: "Cuestionario",
    caso_uso: "Prueba",
    nicho: "General",
    descripcion: "Descripción de prueba.",
    usa_scoring: false,
  },
  configuracion: {},
}];

function renderBiblioteca(onCrearCopia?: (nombre: string, configuracion: unknown) => void) {
  return renderToStaticMarkup(createElement(BibliotecaTemplates, {
    templates,
    casosReferencia: [],
    copiasGuardadas: [],
    cargandoCopias: false,
    errorBiblioteca: "",
    accesoCuenta: null,
    onCrearCopia,
    onAbrirCopia: vi.fn(),
    onSeleccionar: vi.fn(),
  }));
}

describe("visibilidad de acciones en la biblioteca", () => {
  it("oculta crear copia sin autorización y mantiene Probar", () => {
    const markup = renderBiblioteca();

    expect(markup).toContain(">Probar</button>");
    expect(markup).not.toContain("Usar como plantilla");
  });

  it("muestra crear copia cuando se proporciona el callback autorizado", () => {
    const markup = renderBiblioteca(vi.fn());

    expect(markup).toContain(">Probar</button>");
    expect(markup).toContain("Usar como plantilla");
  });
});
