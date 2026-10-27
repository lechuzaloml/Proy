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

  it("ofrece solo las opciones de contacto que admite el modelo", () => {
    const markup = renderEditor(true);

    expect(markup).toContain("Momento de solicitud");
    expect(markup).toContain(">Antes de las preguntas</option>");
    expect(markup).toContain(">Después de las preguntas</option>");
    expect(markup).toContain("Nombre <span>Obligatorio</span>");
    expect(markup).toContain("Correo electrónico <span>Obligatorio</span>");
    expect(markup).toContain("Teléfono / WhatsApp <span>Obligatorio</span>");
    expect(markup).toContain("He leído el aviso y consiento el uso de mis datos");
    expect(markup).not.toContain("Hacer opcional");
  });

  it("previsualiza el contenido actual sin mostrar datos internos de scoring", () => {
    const markup = renderEditor(true);
    const pregunta = validacion.data.preguntas[0];

    expect(markup).toContain("Así lo verá tu audiencia");
    expect(markup).toContain(pregunta.texto);
    if (pregunta.tipo === "opcion_multiple") {
      expect(markup).toContain(pregunta.opciones[0].texto);
    }
    expect(markup).toContain("Los puntos de scoring son internos");
    expect(markup).not.toContain(">0 puntos</span>");
  });

  it("refleja en la vista previa que el contacto se solicita al final", () => {
    const markup = renderEditor(true);
    const indicePregunta = markup.indexOf(validacion.data.preguntas[0].texto);
    const indiceContacto = markup.indexOf(
      'aria-label="Vista previa de los datos de contacto"',
    );

    expect(indicePregunta).toBeGreaterThan(-1);
    expect(indiceContacto).toBeGreaterThan(indicePregunta);
  });
});
