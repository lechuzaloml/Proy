import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import EditorCuestionario from "./EditorCuestionario";
import { validarCuestionario } from "../validation/validarCuestionario";
import { cambiarModoScoring } from "../templates/editarCuestionario";

const validacion = validarCuestionario(casoNuevo);
if (!validacion.valido) {
  throw new Error("El fixture de prueba debe ser un cuestionario válido.");
}

function renderEditor(
  copiaGuardada: boolean,
  cuestionario = validacion.data,
) {
  return renderToStaticMarkup(createElement(EditorCuestionario, {
    id: "personalizado-prueba",
    nombre: "Copia de prueba",
    cuestionario,
    copiaGuardada,
    onGuardar: vi.fn(),
    onPrevisualizar: vi.fn(),
    onDescartar: vi.fn(),
    onEliminar: vi.fn(),
  }));
}

describe("acciones del editor de copias", () => {
  it("permite descartar una copia nueva y no ofrece eliminar", () => {
    const markup = renderEditor(false);

    expect(markup).toContain(">Guardar</button>");
    expect(markup).toContain(">Descartar</button>");
    expect(markup).not.toContain(">Eliminar</button>");
  });

  it("ofrece eliminar una copia guardada y no ofrece descartar", () => {
    const markup = renderEditor(true);

    expect(markup).toContain(">Guardar</button>");
    expect(markup).toContain(">Eliminar</button>");
    expect(markup).not.toContain(">Descartar</button>");
  });

  it("muestra controles para scoring, reglas, segmentos y puntos", () => {
    const markup = renderEditor(true);

    expect(markup).toContain("Usar puntuación y resultados por segmento");
    expect(markup).toContain("Puntos de la opción");
    expect(markup).toContain("Reglas de puntuación");
    expect(markup).toContain("Resultados por segmento");
  });

  it("muestra solo el resultado fijo cuando scoring está desactivado", () => {
    const cuestionario = cambiarModoScoring(validacion.data, false);
    const markup = renderEditor(true, cuestionario);

    expect(markup).toContain("Resultado fijo");
    expect(markup).toContain("sin calcular puntuaciones ni clasificaciones");
    expect(markup).not.toContain("Reglas de puntuación");
    expect(markup).not.toContain("Puntos de la opción");
  });
});
