import { describe, expect, it } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";
import {
  calcularResultado,
  type RespuestasCuestionario,
} from "./calcularResultado";

function obtenerCuestionario(data: unknown = casoNuevo): Cuestionario {
  const validacion = validarCuestionario(data);
  if (!validacion.valido) {
    throw new Error(validacion.errores.join("\n"));
  }
  return validacion.data;
}

function obtenerPreguntaAbierta(cuestionario: Cuestionario) {
  const pregunta = cuestionario.preguntas.find(
    (item) => item.tipo === "abierta",
  );
  if (!pregunta || pregunta.tipo !== "abierta") {
    throw new Error("El fixture debe incluir una pregunta abierta.");
  }
  return pregunta;
}

function obtenerPreguntaEscala(cuestionario: Cuestionario) {
  const pregunta = cuestionario.preguntas.find(
    (item) => item.tipo === "escala",
  );
  if (!pregunta || pregunta.tipo !== "escala") {
    throw new Error("El fixture debe incluir una pregunta de escala.");
  }
  return pregunta;
}

function obtenerResultadoSegmentado(
  respuestas: RespuestasCuestionario,
  cuestionario = obtenerCuestionario(),
) {
  const calculo = calcularResultado(cuestionario, respuestas);
  if (calculo.estado !== "ok" || calculo.tipo !== "segmentado") {
    throw new Error("Se esperaba un resultado segmentado.");
  }
  return calculo;
}

describe("calcularResultado", () => {
  it("calcula el segmento frio y su puntaje total", () => {
    const resultado = obtenerResultadoSegmentado({});

    expect(resultado.segmento).toBe("frio");
    expect(resultado.puntajeTotal).toBe(0);
  });

  it("calcula el segmento tibio y su puntaje total", () => {
    const resultado = obtenerResultadoSegmentado({
      0: { tipo: "opcion_multiple", indiceOpcion: 1 },
      1: { tipo: "opcion_multiple", indiceOpcion: 1 },
      2: { tipo: "escala", valor: 3 },
      4: { tipo: "opcion_multiple", indiceOpcion: 2 },
    });

    expect(resultado.segmento).toBe("tibio");
    expect(resultado.puntajeTotal).toBe(25);
  });

  it("calcula el segmento listo y su puntaje total", () => {
    const resultado = obtenerResultadoSegmentado({
      0: { tipo: "opcion_multiple", indiceOpcion: 2 },
      1: { tipo: "opcion_multiple", indiceOpcion: 2 },
      2: { tipo: "escala", valor: 5 },
      4: { tipo: "opcion_multiple", indiceOpcion: 0 },
    });

    expect(resultado.segmento).toBe("listo");
    expect(resultado.puntajeTotal).toBe(80);
  });

  it("ignora las preguntas que no participan en scoring", () => {
    const cuestionario = obtenerCuestionario();
    const preguntaAbierta = obtenerPreguntaAbierta(cuestionario);
    const indiceAbierta = cuestionario.preguntas.indexOf(preguntaAbierta);
    const sinRespuesta = obtenerResultadoSegmentado({});
    const conRespuestaIgnorada = obtenerResultadoSegmentado({
      [indiceAbierta]: { tipo: "abierta", valor: "Respuesta de prueba" },
    });

    expect(preguntaAbierta.participa_scoring).toBe(false);
    expect(conRespuestaIgnorada.puntajeTotal).toBe(sinRespuesta.puntajeTotal);
    expect(conRespuestaIgnorada.segmento).toBe(sinRespuesta.segmento);
  });

  it("asigna cero cuando el valor de escala no aparece en puntos_por_valor", () => {
    const cuestionarioOriginal = obtenerCuestionario();
    const cuestionarioSinValor = structuredClone(cuestionarioOriginal);
    const preguntaEscala = obtenerPreguntaEscala(cuestionarioSinValor);
    const indiceEscala = cuestionarioSinValor.preguntas.indexOf(preguntaEscala);
    const puntos = preguntaEscala.puntos_por_valor ?? {};
    delete puntos["3"];
    preguntaEscala.puntos_por_valor = puntos;

    const cuestionario = obtenerCuestionario(cuestionarioSinValor);
    const resultado = obtenerResultadoSegmentado(
      { [indiceEscala]: { tipo: "escala", valor: 3 } },
      cuestionario,
    );

    expect(resultado.puntajeTotal).toBe(0);
    expect(resultado.segmento).toBe("frio");
  });

  it("asigna cero a una opción múltiple que no define puntos", () => {
    const cuestionarioSinPuntos = structuredClone(obtenerCuestionario());
    const pregunta = cuestionarioSinPuntos.preguntas[0];
    if (!pregunta || pregunta.tipo !== "opcion_multiple") {
      throw new Error("El fixture debe iniciar con una pregunta de opción múltiple.");
    }
    delete pregunta.opciones[0].puntos;
    const cuestionario = obtenerCuestionario(cuestionarioSinPuntos);
    const resultado = obtenerResultadoSegmentado(
      { 0: { tipo: "opcion_multiple", indiceOpcion: 0 } },
      cuestionario,
    );

    expect(resultado.puntajeTotal).toBe(0);
    expect(resultado.segmento).toBe("frio");
  });

  it("no asigna puntos automáticamente a una pregunta abierta participante", () => {
    const cuestionarioSinScoringAbierto = structuredClone(obtenerCuestionario());
    const preguntaAbierta = obtenerPreguntaAbierta(
      cuestionarioSinScoringAbierto,
    );
    preguntaAbierta.participa_scoring = true;
    const indiceAbierta =
      cuestionarioSinScoringAbierto.preguntas.indexOf(preguntaAbierta);
    const cuestionario = obtenerCuestionario(cuestionarioSinScoringAbierto);
    const resultado = obtenerResultadoSegmentado(
      { [indiceAbierta]: { tipo: "abierta", valor: "Texto libre" } },
      cuestionario,
    );

    expect(resultado.puntajeTotal).toBe(0);
    expect(resultado.segmento).toBe("frio");
  });

  it("devuelve un error explícito cuando el puntaje no cae en ningún rango", () => {
    const cuestionarioSinCobertura = structuredClone(obtenerCuestionario());
    const ultimaRegla =
      cuestionarioSinCobertura.reglas_scoring[
        cuestionarioSinCobertura.reglas_scoring.length - 1
      ];
    if (!ultimaRegla) {
      throw new Error("El fixture debe incluir reglas de scoring.");
    }
    ultimaRegla.puntaje_max = 79;
    const cuestionario = obtenerCuestionario(cuestionarioSinCobertura);

    expect(
      calcularResultado(cuestionario, {
        0: { tipo: "opcion_multiple", indiceOpcion: 2 },
        1: { tipo: "opcion_multiple", indiceOpcion: 2 },
        2: { tipo: "escala", valor: 5 },
        4: { tipo: "opcion_multiple", indiceOpcion: 0 },
      }),
    ).toEqual({
      estado: "error",
      tipo: "sin_segmento",
      puntajeTotal: 80,
    });
  });

  it("devuelve directamente el resultado fijo cuando no hay scoring", () => {
    const resultadoFijo = {
      tipo: "fijo" as const,
      contenido: "Este es el resultado fijo.",
    };
    const cuestionario: Cuestionario = {
      id: "cuestionario-sin-scoring",
      cliente: "Prueba",
      estado: "caso_de_prueba",
      posicion_contacto: "final",
      usa_scoring: false,
      preguntas: [],
      resultado: resultadoFijo,
    };

    expect(calcularResultado(cuestionario, {})).toEqual({
      estado: "ok",
      tipo: "fijo",
      resultado: resultadoFijo,
    });
  });
});
