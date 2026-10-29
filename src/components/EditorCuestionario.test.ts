import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import EditorCuestionario from "./EditorCuestionario";
import RenderizadorCuestionario from "./RenderizadorCuestionario";
import { validarCuestionario } from "../validation/validarCuestionario";
import { cambiarModoScoring } from "../templates/editarCuestionario";
import type { Cuestionario } from "../types/model";

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

function crearCuestionarioFlujo({
  posicionContacto,
  bienvenidaHabilitada,
}: {
  posicionContacto: "inicio" | "final";
  bienvenidaHabilitada: boolean;
}): Cuestionario {
  return {
    id: "flujo-prueba",
    cliente: "Clear-IA",
    estado: "publicado",
    posicion_contacto: posicionContacto,
    preguntas: [
      {
        id: "pregunta-1",
        texto: "¿Cuál es tu prioridad principal?",
        tipo: "opcion_multiple",
        opciones: [
          { texto: "Ventas" },
          { texto: "Marketing" },
        ],
        participa_scoring: false,
      },
    ],
    usa_scoring: false,
    resultado: {
      tipo: "fijo",
      contenido: "Resultado del diagnóstico",
    },
    bienvenida: {
      habilitada: bienvenidaHabilitada,
      ...(bienvenidaHabilitada
        ? {
            titulo: "Diagnóstico inicial de crecimiento",
            descripcion: "Antes de empezar, te haremos unas preguntas.",
            textoBoton: "Iniciar diagnóstico",
          }
        : {}),
    },
  };
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

  it("muestra el control para añadir preguntas después de toda la lista", () => {
    const markup = renderEditor(true);
    const ultimaPregunta = validacion.data.preguntas.at(-1);

    expect(ultimaPregunta).toBeDefined();
    expect(markup.indexOf('aria-label="Añadir pregunta"')).toBeGreaterThan(
      markup.indexOf(ultimaPregunta!.texto),
    );
  });

  it("muestra solo el resultado fijo cuando scoring está desactivado", () => {
    const cuestionario = cambiarModoScoring(validacion.data, false);
    const markup = renderEditor(true, cuestionario);

    expect(markup).toContain("Resultado fijo");
    expect(markup).toContain("sin calcular puntuaciones ni clasificaciones");
    expect(markup).not.toContain("Reglas de puntuación");
    expect(markup).not.toContain("Puntos de la opción");
  });

  it("permite activar Gemini y oculta los textos de resultados por segmento", () => {
    const cuestionario = {
      ...validacion.data,
      personalizar_resultado_con_ia: true,
    };
    const markup = renderEditor(true, cuestionario);

    expect(markup).toContain("Usar Gemini para personalizar los resultados");
    expect(markup).toContain("Los textos base se conservan");
    expect(markup).not.toContain("Contenido del resultado");
    expect(markup).toContain(validacion.data.resultado.tipo === "por_segmento"
      ? `<legend>${validacion.data.resultado.resultados[0]?.segmento}</legend>`
      : "");
  });

  it("permite activar Gemini y oculta el texto del resultado fijo", () => {
    const cuestionario = {
      ...cambiarModoScoring(validacion.data, false),
      personalizar_resultado_con_ia: true,
    };
    const markup = renderEditor(true, cuestionario);

    expect(markup).toContain("Usar Gemini para personalizar el resultado");
    expect(markup).toContain("El texto base se conserva");
    expect(markup).not.toContain("Contenido del resultado");
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

  it("muestra la bienvenida antes del cuestionario cuando los datos personales están al inicio", () => {
    const cuestionario = crearCuestionarioFlujo({
      posicionContacto: "inicio",
      bienvenidaHabilitada: true,
    });
    const markup = renderToStaticMarkup(
      createElement(RenderizadorCuestionario, {
        cuestionario,
        onEnvio: vi.fn(),
      }),
    );

    expect(markup).toContain("Antes de empezar");
    expect(markup).toContain("Iniciar diagnóstico");
    expect(markup).not.toContain("Datos de contacto");
  });

  it("muestra la bienvenida antes del cuestionario aunque los datos personales sean finales", () => {
    const cuestionario = crearCuestionarioFlujo({
      posicionContacto: "final",
      bienvenidaHabilitada: true,
    });
    const markup = renderToStaticMarkup(
      createElement(RenderizadorCuestionario, {
        cuestionario,
        onEnvio: vi.fn(),
      }),
    );

    expect(markup).toContain("Antes de empezar");
    expect(markup).toContain("Iniciar diagnóstico");
    expect(markup).not.toContain("Completa tus datos para continuar con el cuestionario.");
  });

  it("muestra la bienvenida predeterminada si está activa aunque no se haya editado ni agregado imagen", () => {
    const cuestionario = crearCuestionarioFlujo({
      posicionContacto: "inicio",
      bienvenidaHabilitada: true,
    });
    cuestionario.bienvenida = undefined;
    const markup = renderToStaticMarkup(
      createElement(RenderizadorCuestionario, {
        cuestionario,
        onEnvio: vi.fn(),
      }),
    );

    expect(markup).toContain("Antes de empezar");
    expect(markup).toContain("Diagnóstico inicial de crecimiento");
    expect(markup).toContain("Iniciar diagnóstico");
    expect(markup).not.toContain("questionnaire-welcome-image");
    expect(markup).not.toContain("Completa tus datos para continuar con el cuestionario.");
  });

  it("mantiene el flujo directo cuando la bienvenida está desactivada y los datos personales están al inicio", () => {
    const cuestionario = crearCuestionarioFlujo({
      posicionContacto: "inicio",
      bienvenidaHabilitada: false,
    });
    const markup = renderToStaticMarkup(
      createElement(RenderizadorCuestionario, {
        cuestionario,
        onEnvio: vi.fn(),
      }),
    );

    expect(markup).not.toContain("Antes de empezar");
    expect(markup).toContain("Datos de contacto");
  });

  it("mantiene el cuestionario directo cuando la bienvenida está desactivada y los datos personales están al final", () => {
    const cuestionario = crearCuestionarioFlujo({
      posicionContacto: "final",
      bienvenidaHabilitada: false,
    });
    const markup = renderToStaticMarkup(
      createElement(RenderizadorCuestionario, {
        cuestionario,
        onEnvio: vi.fn(),
      }),
    );

    expect(markup).not.toContain("Antes de empezar");
    expect(markup).toContain("¿Cuál es tu prioridad principal?");
  });
});
