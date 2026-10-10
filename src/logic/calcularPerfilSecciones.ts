import type { Cuestionario, Pregunta } from "../types/model";
import type { RespuestasCuestionario } from "./calcularResultado";

export interface DimensionPerfil {
  nombre: string;
  modo: "puntaje" | "avance";
  porcentaje: number;
  respondidas: number;
  totalPreguntas: number;
}

function obtenerPuntajeMaximo(pregunta: Pregunta): number {
  if (pregunta.tipo === "opcion_multiple") {
    return Math.max(0, ...pregunta.opciones.map(({ puntos }) => puntos ?? 0));
  }

  if (pregunta.tipo === "escala") {
    const puntos = Object.entries(pregunta.puntos_por_valor ?? {})
      .filter(([valor]) => {
        const numero = Number(valor);
        return numero >= pregunta.escala.min && numero <= pregunta.escala.max;
      })
      .map(([, puntaje]) => puntaje);

    return Math.max(0, ...puntos);
  }

  return 0;
}

function obtenerPuntajeRespuesta(
  pregunta: Pregunta,
  respuesta: RespuestasCuestionario[number] | undefined,
): number | undefined {
  if (
    pregunta.tipo === "opcion_multiple" &&
    respuesta?.tipo === "opcion_multiple"
  ) {
    return pregunta.opciones[respuesta.indiceOpcion]?.puntos ?? 0;
  }

  if (pregunta.tipo === "escala" && respuesta?.tipo === "escala") {
    return pregunta.puntos_por_valor?.[respuesta.valor] ?? 0;
  }

  return undefined;
}

function respuestaCompleta(
  pregunta: Pregunta,
  respuesta: RespuestasCuestionario[number] | undefined,
): boolean {
  if (!respuesta) {
    return false;
  }

  if (pregunta.tipo === "abierta") {
    return respuesta.tipo === "abierta" && respuesta.valor.trim().length > 0;
  }

  return respuesta.tipo === pregunta.tipo;
}

export function calcularPerfilSecciones(
  cuestionario: Cuestionario,
  respuestas: RespuestasCuestionario,
): DimensionPerfil[] {
  const dimensiones = new Map<
    string,
    {
      puntaje: number;
      puntajeMaximo: number;
      respondidas: number;
      totalPreguntas: number;
    }
  >();

  cuestionario.preguntas.forEach((pregunta, indice) => {
    if (cuestionario.usa_scoring) {
      if (!pregunta.participa_scoring) {
        return;
      }

      const puntajeMaximo = obtenerPuntajeMaximo(pregunta);
      if (puntajeMaximo <= 0) {
        return;
      }

      const nombre = pregunta.seccion ?? pregunta.texto;
      const dimension = dimensiones.get(nombre) ?? {
        puntaje: 0,
        puntajeMaximo: 0,
        respondidas: 0,
        totalPreguntas: 0,
      };
      const puntajeRespuesta = obtenerPuntajeRespuesta(
        pregunta,
        respuestas[indice],
      );

      dimension.puntajeMaximo += puntajeMaximo;
      dimension.totalPreguntas += 1;
      if (puntajeRespuesta !== undefined) {
        dimension.puntaje += puntajeRespuesta;
        dimension.respondidas += 1;
      }
      dimensiones.set(nombre, dimension);
      return;
    }

    const nombre = pregunta.seccion ?? pregunta.texto;
    const dimension = dimensiones.get(nombre) ?? {
      puntaje: 0,
      puntajeMaximo: 0,
      respondidas: 0,
      totalPreguntas: 0,
    };
    dimension.totalPreguntas += 1;
    if (respuestaCompleta(pregunta, respuestas[indice])) {
      dimension.respondidas += 1;
    }
    dimensiones.set(nombre, dimension);
  });

  return Array.from(dimensiones, ([nombre, dimension]) => ({
    nombre,
    modo: cuestionario.usa_scoring ? "puntaje" : "avance",
    porcentaje: cuestionario.usa_scoring
      ? Math.round((dimension.puntaje / dimension.puntajeMaximo) * 100)
      : Math.round(
          (dimension.respondidas / dimension.totalPreguntas) * 100,
        ),
    respondidas: dimension.respondidas,
    totalPreguntas: dimension.totalPreguntas,
  }));
}
