import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GestorMiembros from "./GestorMiembros";

describe("permiso de publicación en GestorMiembros", () => {
  it("lo incluye por defecto desmarcado y deshabilitado sin editarCuestionarios", () => {
    const markup = renderToStaticMarkup(createElement(GestorMiembros, {
      empresaId: "empresa-prueba",
      empresaNombre: "Empresa de prueba",
      rolActual: "propietario",
      correoActual: "owner@example.invalid",
    }));
    const etiqueta = "Publicar y despublicar cuestionarios";
    const indice = markup.indexOf(etiqueta);
    const inicioEtiqueta = markup.lastIndexOf("<label", indice);
    const input = markup.slice(inicioEtiqueta, indice);

    expect(indice).toBeGreaterThan(-1);
    expect(input).toContain('type="checkbox"');
    expect(input).toContain("disabled");
    expect(input).not.toContain("checked");
  });
});
