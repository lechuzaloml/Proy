import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import { construirDocumentoCuestionarioGuardado } from "../lib/documentoCuestionario";
import { validarCuestionario } from "../validation/validarCuestionario";
import {
  agregarOpcion,
  agregarPregunta,
  actualizarReglaScoring,
  actualizarResultadoFijo,
  actualizarResultadoSegmentado,
  cambiarModoScoring,
  cambiarNombreCuestionario,
  cambiarOpcionPregunta,
  cambiarParticipacionScoring,
  cambiarPuntosOpcion,
  cambiarTextoPregunta,
  agregarPreguntaSiNo,
  eliminarOpcion,
  eliminarPregunta,
} from "./editarCuestionario";
import { crearCuestionarioDesdeCero } from "./crearCuestionarioDesdeCero";

const validacion = validarCuestionario(casoNuevo);
if (!validacion.valido) {
  throw new Error("El fixture de prueba debe ser un cuestionario válido.");
}
const cuestionarioOriginal = validacion.data;
const originalPreguntaCount = cuestionarioOriginal.preguntas.length;

describe("edición inmutable de cuestionarios", () => {
  it("crea un cuestionario vacío con el formulario de contacto al inicio", () => {
    const primero = crearCuestionarioDesdeCero();
    const segundo = crearCuestionarioDesdeCero();

    expect(primero.id).toMatch(/^personalizado-/);
    expect(primero.id).not.toBe(segundo.id);
    expect(primero.posicion_contacto).toBe("inicio");
    expect(primero.preguntas).toEqual([]);
    expect(primero.usa_scoring).toBe(false);
    expect(validarCuestionario(primero).valido).toBe(true);
  });

  it("alterna scoring sin scoring, conserva respuestas y resultado fijo sin clasificar", () => {
    const original = structuredClone(cuestionarioOriginal);
    const sinScoring = cambiarModoScoring(cuestionarioOriginal, false);
    const validacionSinScoring = validarCuestionario(sinScoring);

    expect(sinScoring.usa_scoring).toBe(false);
    expect(sinScoring.resultado.tipo).toBe("fijo");
    expect("reglas_scoring" in sinScoring).toBe(false);
    expect(sinScoring.preguntas).toEqual(
      cuestionarioOriginal.preguntas.map((pregunta) => ({
        ...pregunta,
        participa_scoring: false,
      })),
    );
    expect(validacionSinScoring.valido).toBe(true);
    expect(cuestionarioOriginal).toEqual(original);

    const sinScoringValidado = validarCuestionario(sinScoring);
    if (!sinScoringValidado.valido) {
      throw new Error("Se esperaba una copia válida sin scoring.");
    }
    const documentoSinScoring = construirDocumentoCuestionarioGuardado({
      id: "personalizado-sin-scoring",
      nombre: "Copia sin scoring",
      configuracion: sinScoringValidado.data,
      creadoPor: "editor@example.invalid",
      creadoEn: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
      actualizadoEn: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
    });
    expect(documentoSinScoring.valido).toBe(true);
    if (!documentoSinScoring.valido) {
      throw new Error("Se esperaba que la copia sin scoring pudiera guardarse.");
    }
    expect(documentoSinScoring.data.configuracion.usa_scoring).toBe(false);
    expect(documentoSinScoring.data.configuracion.resultado).toEqual(
      sinScoring.resultado,
    );
    const regresoAlScoring = cambiarModoScoring(sinScoringValidado.data, true);
    expect(validarCuestionario(regresoAlScoring).valido).toBe(true);
    expect(regresoAlScoring.usa_scoring).toBe(true);
    if (regresoAlScoring.usa_scoring) {
      expect(regresoAlScoring.resultado.resultados[0]?.contenido).toBe(
        sinScoring.resultado.contenido,
      );
      expect(regresoAlScoring.reglas_scoring).toEqual([
        { puntaje_min: 0, puntaje_max: 0, segmento: "General" },
      ]);
    }
  });

  it("edita puntos, reglas y resultados y conserva todo en la configuración guardada", () => {
    const originalAntes = structuredClone(cuestionarioOriginal);
    const originalConExtensiones = {
      ...cuestionarioOriginal,
      extensionNoEditada: { conservar: true },
    };
    const indiceOpcion = originalConExtensiones.preguntas.findIndex(
      (pregunta) => pregunta.tipo === "opcion_multiple",
    );
    const editable = cambiarParticipacionScoring(
      originalConExtensiones,
      indiceOpcion,
      true,
    );
    const conPuntos = cambiarPuntosOpcion(editable, indiceOpcion, 0, 17);
    if (!conPuntos.usa_scoring) {
      throw new Error("El fixture debe tener scoring.");
    }
    const actualizadaRegla = actualizarReglaScoring(conPuntos, 0, {
      puntaje_min: -1,
      segmento: "segmento-editado",
    });
    const indiceResultado = actualizadaRegla.resultado.resultados.findIndex(
      ({ segmento }) => segmento === "segmento-editado",
    );
    const actualizadaResultado = actualizarResultadoSegmentado(
      actualizadaRegla,
      indiceResultado,
      { contenido: "Resultado personalizado." },
    );
    const validacionGuardada = validarCuestionario(actualizadaResultado);

    expect(validacionGuardada.valido).toBe(true);
    const documento = construirDocumentoCuestionarioGuardado({
      id: "personalizado-edicion",
      nombre: "Copia editada",
      configuracion: actualizadaResultado,
      creadoPor: "editor@example.invalid",
      creadoEn: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
      actualizadoEn: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
    });
    expect(documento.valido).toBe(true);
    if (!documento.valido || !documento.data.configuracion.usa_scoring) {
      throw new Error("Se esperaba que la copia con scoring pudiera guardarse.");
    }
    const preguntaGuardada = documento.data.configuracion.preguntas[indiceOpcion];
    expect(preguntaGuardada?.participa_scoring).toBe(true);
    expect(
      preguntaGuardada?.tipo === "opcion_multiple"
        ? preguntaGuardada.opciones[0]?.puntos
        : undefined,
    ).toBe(17);
    expect(documento.data.configuracion.reglas_scoring[0]).toMatchObject({
      puntaje_min: -1,
      segmento: "segmento-editado",
    });
    expect(documento.data.configuracion.resultado.resultados).toContainEqual(
      expect.objectContaining({
        segmento: "segmento-editado",
        contenido: "Resultado personalizado.",
      }),
    );
    expect(
      (documento.data.configuracion as typeof documento.data.configuracion & {
        extensionNoEditada: { conservar: boolean };
      }).extensionNoEditada,
    ).toEqual({ conservar: true });
    expect(cuestionarioOriginal).toEqual(originalAntes);
  });

  it("edita resultado fijo sin añadir puntuación y preserva CTA", () => {
    const sinScoring = cambiarModoScoring(cuestionarioOriginal, false);
    if (sinScoring.usa_scoring) {
      throw new Error("Se esperaba un cuestionario sin scoring.");
    }
    const actualizada = actualizarResultadoFijo(sinScoring, {
      contenido: "Resultado personalizado sin clasificación.",
    });

    expect(validarCuestionario(actualizada).valido).toBe(true);
    expect(actualizada.usa_scoring).toBe(false);
    expect(actualizada.resultado.contenido).toBe(
      "Resultado personalizado sin clasificación.",
    );
    expect(actualizada.resultado.cta).toEqual(sinScoring.resultado.cta);
  });

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

  it("añade una pregunta sí/no como opción múltiple con respuestas predeterminadas", () => {
    const cuestionario = cambiarModoScoring(cuestionarioOriginal, false);
    const actualizado = agregarPreguntaSiNo(cuestionario, "pregunta-si-no");
    const pregunta = actualizado.preguntas.at(-1);

    expect(pregunta).toMatchObject({
      id: "pregunta-si-no",
      tipo: "opcion_multiple",
      opciones: [{ texto: "Sí" }, { texto: "No" }],
      participa_scoring: false,
    });
    expect(validarCuestionario(actualizado).valido).toBe(true);
    expect(cuestionario.preguntas).toHaveLength(
      actualizado.preguntas.length - 1,
    );
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
