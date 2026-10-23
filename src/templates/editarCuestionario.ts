import type {
  Cuestionario,
  Pregunta,
  PreguntaAbierta,
  PreguntaEscala,
  PreguntaOpcionMultiple,
  ReglaScoring,
  ResultadoPorSegmento,
} from "../types/model";

export type TipoPregunta = Pregunta["tipo"];

export function cambiarModoScoring(
  cuestionario: Cuestionario,
  usaScoring: boolean,
): Cuestionario {
  if (usaScoring) {
    if (cuestionario.usa_scoring) {
      return cuestionario;
    }
    const { tipo: _tipo, ...resultadoFijo } = cuestionario.resultado;
    const resultado = {
      ...resultadoFijo,
      segmento: "General",
    };
    return {
      ...cuestionario,
      usa_scoring: true,
      reglas_scoring: [{ puntaje_min: 0, puntaje_max: 0, segmento: "General" }],
      resultado: { tipo: "por_segmento", resultados: [resultado] },
      preguntas: cuestionario.preguntas.map((pregunta) => ({
        ...pregunta,
        participa_scoring: false,
      })),
    };
  }

  if (!cuestionario.usa_scoring) {
    return cuestionario;
  }
  const primerResultado = cuestionario.resultado.resultados[0];
  if (!primerResultado) {
    throw new Error(
      "Añade al menos un resultado por segmento antes de desactivar el scoring.",
    );
  }

  const { reglas_scoring: _reglasScoring, ...cuestionarioSinReglas } =
    cuestionario;
  const { segmento: _segmento, ...resultadoFijo } = primerResultado;
  return {
    ...cuestionarioSinReglas,
    usa_scoring: false,
    resultado: {
      ...resultadoFijo,
      tipo: "fijo",
    },
    preguntas: cuestionario.preguntas.map((pregunta) => ({
      ...pregunta,
      participa_scoring: false,
    })),
  };
}

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

export function cambiarParticipacionScoring(
  cuestionario: Cuestionario,
  indice: number,
  participaScoring: boolean,
): Cuestionario {
  if (!cuestionario.usa_scoring) {
    return cuestionario;
  }
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) =>
      preguntaIndice === indice
        ? { ...pregunta, participa_scoring: participaScoring }
        : pregunta,
    ),
  };
}

export function cambiarPuntosOpcion(
  cuestionario: Cuestionario,
  indicePregunta: number,
  indiceOpcion: number,
  puntos: number | undefined,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) => {
      if (preguntaIndice !== indicePregunta || pregunta.tipo !== "opcion_multiple") {
        return pregunta;
      }
      return {
        ...pregunta,
        opciones: pregunta.opciones.map((opcion, opcionIndice) => {
          if (opcionIndice !== indiceOpcion) {
            return opcion;
          }
          const { puntos: _puntos, ...opcionSinPuntos } = opcion;
          return puntos === undefined
            ? opcionSinPuntos
            : { ...opcionSinPuntos, puntos };
        }),
      };
    }),
  };
}

export function cambiarPuntosEscala(
  cuestionario: Cuestionario,
  indicePregunta: number,
  valorEscala: number,
  puntos: number | undefined,
): Cuestionario {
  return {
    ...cuestionario,
    preguntas: cuestionario.preguntas.map((pregunta, preguntaIndice) => {
      if (preguntaIndice !== indicePregunta || pregunta.tipo !== "escala") {
        return pregunta;
      }
      const puntosPorValor = { ...pregunta.puntos_por_valor };
      if (puntos === undefined) {
        delete puntosPorValor[String(valorEscala)];
      } else {
        puntosPorValor[String(valorEscala)] = puntos;
      }
      const { puntos_por_valor: _puntosPorValor, ...preguntaSinPuntos } = pregunta;
      return Object.keys(puntosPorValor).length === 0
        ? preguntaSinPuntos
        : { ...preguntaSinPuntos, puntos_por_valor: puntosPorValor };
    }),
  };
}

export function actualizarReglaScoring(
  cuestionario: Extract<Cuestionario, { usa_scoring: true }>,
  indice: number,
  cambios: Partial<ReglaScoring>,
): Cuestionario {
  const reglas_scoring = cuestionario.reglas_scoring.map((regla, reglaIndice) =>
    reglaIndice === indice ? { ...regla, ...cambios } : regla,
  );
  let resultados: ResultadoPorSegmento["resultados"] =
    cuestionario.resultado.resultados;
  const reglaAnterior = cuestionario.reglas_scoring[indice];
  if (
    cambios.segmento !== undefined &&
    reglaAnterior &&
    reglaAnterior.segmento !== cambios.segmento
  ) {
    const segmentoNuevo = cambios.segmento;
    resultados = resultados.map((resultado) =>
      resultado.segmento === reglaAnterior.segmento
        ? { ...resultado, segmento: segmentoNuevo }
        : resultado,
    );
  }
  return {
    ...cuestionario,
    reglas_scoring,
    resultado: { ...cuestionario.resultado, resultados },
  };
}

export function actualizarResultadoFijo(
  cuestionario: Extract<Cuestionario, { usa_scoring: false }>,
  cambios: Partial<Extract<Cuestionario["resultado"], { tipo: "fijo" }>>,
): Cuestionario {
  return {
    ...cuestionario,
    resultado: { ...cuestionario.resultado, ...cambios },
  };
}

export function actualizarResultadoSegmentado(
  cuestionario: Extract<Cuestionario, { usa_scoring: true }>,
  indice: number,
  cambios: Partial<ResultadoPorSegmento["resultados"][number]>,
): Cuestionario {
  return {
    ...cuestionario,
    resultado: {
      ...cuestionario.resultado,
      resultados: cuestionario.resultado.resultados.map((resultado, resultadoIndice) =>
        resultadoIndice === indice ? { ...resultado, ...cambios } : resultado,
      ),
    },
  };
}

export function actualizarCTAResultado(
  cuestionario: Cuestionario,
  indiceResultado: number | null,
  campo: "texto" | "accion",
  valor: string,
): Cuestionario {
  if (!cuestionario.usa_scoring) {
    const cta = cuestionario.resultado.cta;
    return cta
      ? actualizarResultadoFijo(cuestionario, {
        cta: { ...cta, [campo]: valor },
      })
      : cuestionario;
  }
  if (indiceResultado === null) {
    return cuestionario;
  }
  const resultado = cuestionario.resultado.resultados[indiceResultado];
  return resultado?.cta
    ? actualizarResultadoSegmentado(cuestionario, indiceResultado, {
      cta: { ...resultado.cta, [campo]: valor },
    })
    : cuestionario;
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

export function agregarPreguntaSiNo(
  cuestionario: Cuestionario,
  id: string,
): Cuestionario {
  const actualizado = agregarPregunta(cuestionario, "opcion_multiple", id);
  return {
    ...actualizado,
    preguntas: actualizado.preguntas.map((pregunta, indice) =>
      indice === actualizado.preguntas.length - 1 &&
        pregunta.tipo === "opcion_multiple"
        ? { ...pregunta, opciones: [{ texto: "Sí" }, { texto: "No" }] }
        : pregunta,
    ),
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
