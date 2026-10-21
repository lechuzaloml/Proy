import type {
  Cuestionario,
  Pregunta,
  PreguntaAbierta,
  PreguntaEscala,
  PreguntaOpcionMultiple,
} from "../types/model";

export type TipoPregunta = Pregunta["tipo"];

export function cambiarNombreCuestionario(
  cuestionario: Cuestionario,
  nombre: string,
  id: string,
): Cuestionario {
  return {
    ...cuestionario,
    id,
    cliente: nombre,
  };
}

export function cambiarTextoPregunta(
  cuestionario: Cuestionario,
  indice: number,
  texto: string,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) =>
      preguntaIndice === indice ? { ...pregunta, texto } : pregunta,
    ),
  };
}

export function cambiarOpcionPregunta(
  cuestionario: Cuestionario,
  indicePregunta: number,
  indiceOpcion: number,
  texto: string,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) => {
      if (
        preguntaIndice !== indicePregunta ||
        pregunta.tipo !== "opcion_multiple"
      ) {
        return pregunta;
      }
      return {
        ...pregunta,
        opciones: pregunta.opciones.map((opcion, opcionIndice) =>
          opcionIndice === indiceOpcion ? { ...opcion, texto } : opcion,
        ),
      };
    }),
  };
}

export function agregarPregunta(
  cuestionario: Cuestionario,
  tipo: TipoPregunta,
  id: string,
): Cuestionario {
  const preguntaBase = {
    id,
    texto: "Escribe la pregunta",
    participa_scoring: false,
  };
  let pregunta: Pregunta;

  if (tipo === "opcion_multiple") {
    const nuevaPregunta: PreguntaOpcionMultiple = {
      ...preguntaBase,
      tipo,
      opciones: [{ texto: "Opción 1" }, { texto: "Opción 2" }],
    };
    pregunta = nuevaPregunta;
  } else if (tipo === "escala") {
    const nuevaPregunta: PreguntaEscala = {
      ...preguntaBase,
      tipo,
      escala: { min: 1, max: 5 },
    };
    pregunta = nuevaPregunta;
  } else {
    const nuevaPregunta: PreguntaAbierta = {
      ...preguntaBase,
      tipo,
    };
    pregunta = nuevaPregunta;
  }

  return {
    ...cuestionario,
    preguntas: [...cuestionario.preguntas, pregunta],
  };
}

export function eliminarPregunta(
  cuestionario: Cuestionario,
  indice: number,
): Cuestionario {
  if (cuestionario.preguntas.length <= 1) {
    return cuestionario;
  }

  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.filter(
      (_pregunta, preguntaIndice) => preguntaIndice !== indice,
    ),
  };
}

export function agregarOpcion(
  cuestionario: Cuestionario,
  indicePregunta: number,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) => {
      if (
        preguntaIndice !== indicePregunta ||
        pregunta.tipo !== "opcion_multiple"
      ) {
        return pregunta;
      }
      return {
        ...pregunta,
        opciones: [...pregunta.opciones, { texto: "Nueva opción" }],
      };
    }),
  };
}

export function eliminarOpcion(
  cuestionario: Cuestionario,
  indicePregunta: number,
  indiceOpcion: number,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) => {
      if (
        preguntaIndice !== indicePregunta ||
        pregunta.tipo !== "opcion_multiple" ||
        pregunta.opciones.length <= 1
      ) {
        return pregunta;
      }
      return {
        ...pregunta,
        opciones: pregunta.opciones.filter(
          (_opcion, opcionIndice) => opcionIndice !== indiceOpcion,
        ),
      };
    }),
  };
}
