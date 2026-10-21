import { describe, expect, it } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import { validarCuestionario } from "../validation/validarCuestionario";
import {
  agregarOpcion,
  agregarPregunta,
  cambiarNombreCuestionario,
  cambiarOpcionPregunta,
  cambiarTextoPregunta,
  eliminarOpcion,
  eliminarPregunta,
} from "./editarCuestionario";

const validacion = validarCuestionario(casoNuevo);
if (!validacion.valido) {
  throw new Error("El fixture de prueba debe ser un cuestionario válido.");
}
const cuestionarioOriginal = validacion.data;
const originalPreguntaCount = cuestionarioOriginal.preguntas.length;

describe("edición inmutable de cuestionarios", () => {
  it("actualiza nombre, ID, texto y opción sin mutar el original ni sus reglas", () => {
    const original = structuredClone(cuestionarioOriginal);
    const preguntaOpcion = cuestionarioOriginal.preguntas.findIndex(
      (pregunta) => pregunta.tipo === "opcion_multiple",
    );
    const conNombre = cambiarNombreCuestionario(
      cuestionarioOriginal,
      "Cuestionario personalizado",
      "personalizado-1",
    );
    const conTexto = cambiarTextoPregunta(conNombre, preguntaOpcion, "Nueva pregunta");
    const conOpcion = cambiarOpcionPregunta(conTexto, preguntaOpcion, 0, "Nueva opción");
    const revisado = validarCuestionario(conOpcion);

    expect(revisado.valido).toBe(true);
    expect(conOpcion).toMatchObject({
      id: "personalizado-1",
      cliente: "Cuestionario personalizado",
      reglas_scoring: cuestionarioOriginal.usa_scoring
        ? cuestionarioOriginal.reglas_scoring
        : undefined,
      resultado: cuestionarioOriginal.resultado,
    });
    expect(cuestionarioOriginal).toEqual(original);
    expect(conOpcion.preguntas[preguntaOpcion]).not.toBe(
      cuestionarioOriginal.preguntas[preguntaOpcion],
    );
  });

  it("añade preguntas de cada tipo sin activar scoring ni alterar resultados", () => {
    const tipos = ["opcion_multiple", "escala", "abierta"] as const;
    const editado = tipos.reduce(
      (actual, tipo, indice) => agregarPregunta(actual, tipo, `pregunta-nueva-${indice}`),
      cuestionarioOriginal,
    );

    expect(editado.preguntas).toHaveLength(cuestionarioOriginal.preguntas.length + 3);
    expect(editado.preguntas.slice(-3).map(({ tipo }) => tipo)).toEqual(tipos);
    expect(editado.preguntas.slice(-3).every(({ participa_scoring }) =>
      !participa_scoring,
    )).toBe(true);
    expect(editado.usa_scoring).toBe(cuestionarioOriginal.usa_scoring);
    expect(editado.resultado).toEqual(cuestionarioOriginal.resultado);
    expect(validarCuestionario(editado).valido).toBe(true);
  });

  it("añade y elimina opciones y preguntas mediante nuevas referencias", () => {
    const indiceOpcion = cuestionarioOriginal.preguntas.findIndex(
      (pregunta) => pregunta.tipo === "opcion_multiple",
    );
    const pregunta = cuestionarioOriginal.preguntas[indiceOpcion];
    if (!pregunta || pregunta.tipo !== "opcion_multiple") {
      throw new Error("El fixture requiere una pregunta de opción múltiple.");
    }

    const conOpcion = agregarOpcion(cuestionarioOriginal, indiceOpcion);
    expect(conOpcion.preguntas[indiceOpcion]).not.toBe(pregunta);
    if (conOpcion.preguntas[indiceOpcion].tipo !== "opcion_multiple") {
      throw new Error("La pregunta editada cambió de tipo inesperadamente.");
    }
    expect(conOpcion.preguntas[indiceOpcion].opciones).toHaveLength(
      pregunta.opciones.length + 1,
    );

    const sinOpcion = eliminarOpcion(conOpcion, indiceOpcion, 0);
    expect(sinOpcion.preguntas[indiceOpcion].tipo).toBe("opcion_multiple");
    if (sinOpcion.preguntas[indiceOpcion].tipo !== "opcion_multiple") {
      throw new Error("La pregunta editada cambió de tipo inesperadamente.");
    }
    expect(sinOpcion.preguntas[indiceOpcion].opciones).toHaveLength(
      pregunta.opciones.length,
    );

    const sinPregunta = eliminarPregunta(sinOpcion, 0);
    expect(sinPregunta.preguntas).toHaveLength(cuestionarioOriginal.preguntas.length - 1);
    expect(cuestionarioOriginal.preguntas).toHaveLength(
      originalPreguntaCount,
    );
  });
});
