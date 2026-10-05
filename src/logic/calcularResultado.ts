import type {
  Cuestionario,
  ResultadoFijo,
  ResultadoPorSegmento,
} from "../types/model";

export type Respuesta =
  | { tipo: "opcion_multiple"; indiceOpcion: number }
  | { tipo: "escala"; valor: number }
  | { tipo: "abierta"; valor: string };

export type RespuestasCuestionario = Partial<Record<number, Respuesta>>;

type ResultadoSegmento = ResultadoPorSegmento["resultados"][number];

export type ResultadoCalculado =
  | { estado: "ok"; tipo: "fijo"; resultado: ResultadoFijo }
  | {
      estado: "ok";
      tipo: "segmentado";
      resultado: ResultadoSegmento;
      puntajeTotal: number;
      segmento: string;
    }
  | { estado: "error"; tipo: "sin_segmento"; puntajeTotal: number }
  | {
      estado: "error";
      tipo: "resultado_no_encontrado";
      puntajeTotal: number;
      segmento: string;
    };

export function calcularResultado(
  cuestionario: Cuestionario,
  respuestas: RespuestasCuestionario,
): ResultadoCalculado {
  if (!cuestionario.usa_scoring) {
    return {
      estado: "ok",
      tipo: "fijo",
      resultado: cuestionario.resultado,
    };
  }

  const puntajeTotal = cuestionario.preguntas.reduce(
    (total, pregunta, indice) => {
      if (!pregunta.participa_scoring) {
        return total;
      }

      const respuesta = respuestas[indice];
      if (!respuesta) {
        return total;
      }

      if (
        pregunta.tipo === "opcion_multiple" &&
        respuesta.tipo === "opcion_multiple"
      ) {
        return (
          total +
          (pregunta.opciones[respuesta.indiceOpcion]?.puntos ?? 0)
        );
      }

      if (pregunta.tipo === "escala" && respuesta.tipo === "escala") {
        return total + (pregunta.puntos_por_valor?.[respuesta.valor] ?? 0);
      }

      return total;
    },
    0,
  );

  const regla = cuestionario.reglas_scoring.find(
    ({ puntaje_min, puntaje_max }) =>
      puntaje_min <= puntajeTotal && puntajeTotal <= puntaje_max,
  );

  if (!regla) {
    return { estado: "error", tipo: "sin_segmento", puntajeTotal };
  }

  const resultado = cuestionario.resultado.resultados.find(
    ({ segmento }) => segmento === regla.segmento,
  );

  if (!resultado) {
    return {
      estado: "error",
      tipo: "resultado_no_encontrado",
      puntajeTotal,
      segmento: regla.segmento,
    };
  }

  return {
    estado: "ok",
    tipo: "segmentado",
    resultado,
    puntajeTotal,
    segmento: regla.segmento,
  };
}
