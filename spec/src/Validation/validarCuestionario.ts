import type {
  Cuestionario,
  Pregunta,
  ReglaScoring,
  Resultado,
} from "../types/model";

type Registro = Record<string, unknown>;

function esRegistro(value: unknown): value is Registro {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function esTexto(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function esNumero(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function tienePropiedad(value: Registro, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validarCTA(value: unknown, path: string, errores: string[]): boolean {
  if (!esRegistro(value)) {
    errores.push(`${path} debe ser un objeto con texto y acción.`);
    return false;
  }

  let valido = true;
  if (!esTexto(value.texto)) {
    errores.push(`${path}.texto debe ser un texto no vacío.`);
    valido = false;
  }
  if (!esTexto(value.accion)) {
    errores.push(`${path}.accion debe ser un texto no vacío.`);
    valido = false;
  }
  return valido;
}

function validarResultadoFijo(
  value: Registro,
  errores: string[],
): value is Resultado {
  let valido = true;
  if (!esTexto(value.contenido)) {
    errores.push("resultado.contenido debe ser un texto no vacío.");
    valido = false;
  }
  if (tienePropiedad(value, "cta") && !validarCTA(value.cta, "resultado.cta", errores)) {
    valido = false;
  }
  return valido;
}

function validarResultadoPorSegmento(
  value: Registro,
  errores: string[],
): value is Resultado {
  if (!Array.isArray(value.resultados)) {
    errores.push("resultado.resultados debe ser un array.");
    return false;
  }

  let valido = true;
  value.resultados.forEach((resultado, index) => {
    const path = `resultado.resultados[${index}]`;
    if (!esRegistro(resultado)) {
      errores.push(`${path} debe ser un objeto de resultado por segmento.`);
      valido = false;
      return;
    }
    if (!esTexto(resultado.segmento)) {
      errores.push(`${path}.segmento debe ser un texto no vacío.`);
      valido = false;
    }
    if (!esTexto(resultado.contenido)) {
      errores.push(`${path}.contenido debe ser un texto no vacío.`);
      valido = false;
    }
    if (tienePropiedad(resultado, "cta") && !validarCTA(resultado.cta, `${path}.cta`, errores)) {
      valido = false;
    }
  });
  return valido;
}

function validarReglaScoring(
  value: unknown,
  index: number,
  errores: string[],
): value is ReglaScoring {
  const path = `reglas_scoring[${index}]`;
  if (!esRegistro(value)) {
    errores.push(`${path} debe ser un objeto de regla de scoring.`);
    return false;
  }

  let valido = true;
  if (!esNumero(value.puntaje_min)) {
    errores.push(`${path}.puntaje_min debe ser numérico.`);
    valido = false;
  }
  if (!esNumero(value.puntaje_max)) {
    errores.push(`${path}.puntaje_max debe ser numérico.`);
    valido = false;
  }
  if (esNumero(value.puntaje_min) && esNumero(value.puntaje_max) && value.puntaje_min > value.puntaje_max) {
    errores.push(`${path}.puntaje_min no puede ser mayor que puntaje_max.`);
    valido = false;
  }
  if (!esTexto(value.segmento)) {
    errores.push(`${path}.segmento debe ser un texto no vacío.`);
    valido = false;
  }
  return valido;
}

function validarPregunta(
  value: unknown,
  index: number,
  usaScoring: boolean,
  errores: string[],
): value is Pregunta {
  const path = `preguntas[${index}]`;
  if (!esRegistro(value)) {
    errores.push(`${path} debe ser un objeto de pregunta.`);
    return false;
  }

  let valido = true;
  if (!esTexto(value.id)) {
    errores.push(`${path}.id debe ser un texto no vacío.`);
    valido = false;
  }
  if (!esTexto(value.texto)) {
    errores.push(`${path}.texto debe ser un texto no vacío.`);
    valido = false;
  }
  if (tienePropiedad(value, "seccion") && !esTexto(value.seccion)) {
    errores.push(`${path}.seccion debe ser un texto no vacío cuando existe.`);
    valido = false;
  }
  if (typeof value.participa_scoring !== "boolean") {
    errores.push(`${path}.participa_scoring debe ser booleano.`);
    valido = false;
  } else if (value.participa_scoring && !usaScoring) {
    errores.push(`${path} participa en scoring, pero el cuestionario tiene usa_scoring=false.`);
    valido = false;
  }

  switch (value.tipo) {
    case "opcion_multiple": {
      if (!Array.isArray(value.opciones) || value.opciones.length === 0) {
        errores.push(`${path}: la pregunta de opción múltiple no tiene una estructura válida; requiere opciones no vacías.`);
        return false;
      }
      value.opciones.forEach((opcion, opcionIndex) => {
        const opcionPath = `${path}.opciones[${opcionIndex}]`;
        if (!esRegistro(opcion)) {
          errores.push(`${opcionPath} debe ser un objeto de opción.`);
          valido = false;
          return;
        }
        if (!esTexto(opcion.texto)) {
          errores.push(`${opcionPath}.texto debe ser un texto no vacío.`);
          valido = false;
        }
        if (tienePropiedad(opcion, "puntos") && !esNumero(opcion.puntos)) {
          errores.push(`${opcionPath}.puntos debe ser numérico cuando existe.`);
          valido = false;
        }
      });
      return valido;
    }
    case "escala": {
      if (!esRegistro(value.escala)) {
        errores.push(`${path}.escala debe ser un objeto con min y max.`);
        return false;
      }
      const escala = value.escala;
      if (!esNumero(escala.min)) {
        errores.push(`${path}.escala.min debe ser numérico.`);
        valido = false;
      }
      if (!esNumero(escala.max)) {
        errores.push(`${path}.escala.max debe ser numérico.`);
        valido = false;
      }
      if (esNumero(escala.min) && esNumero(escala.max) && escala.min > escala.max) {
        errores.push(`${path}.escala.min no puede ser mayor que max.`);
        valido = false;
      }
      for (const etiqueta of ["etiqueta_min", "etiqueta_max"]) {
        if (tienePropiedad(escala, etiqueta) && typeof escala[etiqueta] !== "string") {
          errores.push(`${path}.escala.${etiqueta} debe ser texto cuando existe.`);
          valido = false;
        }
      }
      if (tienePropiedad(value, "puntos_por_valor")) {
        const puntos = value.puntos_por_valor;
        if (!esRegistro(puntos)) {
          errores.push(`${path}.puntos_por_valor debe ser un objeto de valores numéricos.`);
          valido = false;
        } else {
          for (const [valor, puntaje] of Object.entries(puntos)) {
            const numeroValor = Number(valor);
            if (!Number.isFinite(numeroValor) || !esNumero(puntaje)) {
              errores.push(`${path}.puntos_por_valor[${valor}] debe asociar un valor de escala con puntos numéricos.`);
              valido = false;
            } else if (
              esNumero(escala.min) &&
              esNumero(escala.max) &&
              (numeroValor < escala.min || numeroValor > escala.max)
            ) {
              errores.push(`${path}.puntos_por_valor incluye el valor ${valor} fuera del rango de la escala.`);
              valido = false;
            }
          }
        }
      }
      return valido;
    }
    case "abierta":
      if (tienePropiedad(value, "limite_caracteres") && !esNumero(value.limite_caracteres)) {
        errores.push(`${path}.limite_caracteres debe ser numérico cuando existe.`);
        valido = false;
      }
      return valido;
    default:
      errores.push(`${path}.tipo debe ser opcion_multiple, escala o abierta.`);
      return false;
  }
}

function esCuestionario(
  value: unknown,
  errores: string[],
): value is Cuestionario {
  if (!esRegistro(value)) {
    errores.push("cuestionario debe ser un objeto.");
    return false;
  }

  let valido = true;
  for (const campo of ["id", "cliente", "estado"]) {
    if (!esTexto(value[campo])) {
      errores.push(`cuestionario.${campo} debe ser un texto no vacío.`);
      valido = false;
    }
  }

  if (value.usa_scoring !== true && value.usa_scoring !== false) {
    errores.push("cuestionario.usa_scoring debe ser exactamente true o false.");
    valido = false;
  }
  const usaScoring = value.usa_scoring === true;

  if (value.posicion_contacto !== "inicio" && value.posicion_contacto !== "final") {
    errores.push('cuestionario.posicion_contacto debe ser "inicio" o "final".');
    valido = false;
  }

  if (!Array.isArray(value.secciones)) {
    errores.push("cuestionario.secciones debe ser un array.");
    valido = false;
  } else {
    value.secciones.forEach((seccion, index) => {
      if (!esTexto(seccion)) {
        errores.push(`secciones[${index}] debe ser un texto no vacío.`);
        valido = false;
      }
    });
  }

  if (!Array.isArray(value.preguntas)) {
    errores.push("cuestionario.preguntas debe ser un array.");
    valido = false;
  } else {
    value.preguntas.forEach((pregunta, index) => {
      if (!validarPregunta(pregunta, index, usaScoring, errores)) {
        valido = false;
      }
    });
  }

  const tieneReglas = tienePropiedad(value, "reglas_scoring");
  if (usaScoring) {
    if (!tieneReglas) {
      errores.push("Un cuestionario con scoring necesita reglas de scoring.");
      valido = false;
    } else if (!Array.isArray(value.reglas_scoring) || value.reglas_scoring.length === 0) {
      errores.push("Un cuestionario con scoring necesita reglas de scoring en un array no vacío.");
      valido = false;
    } else {
      value.reglas_scoring.forEach((regla, index) => {
        if (!validarReglaScoring(regla, index, errores)) {
          valido = false;
        }
      });
    }
  } else if (tieneReglas) {
    errores.push("Un cuestionario sin scoring no debe incluir reglas_scoring.");
    valido = false;
  }

  if (!esRegistro(value.resultado)) {
    errores.push("cuestionario.resultado debe ser un objeto.");
    valido = false;
  } else if (usaScoring) {
    if (value.resultado.tipo !== "por_segmento") {
      errores.push('Un cuestionario con scoring requiere resultado.tipo="por_segmento".');
      valido = false;
    } else if (!validarResultadoPorSegmento(value.resultado, errores)) {
      valido = false;
    }
  } else if (value.resultado.tipo !== "fijo") {
    errores.push('Un cuestionario sin scoring requiere resultado.tipo="fijo".');
    valido = false;
  } else if (!validarResultadoFijo(value.resultado, errores)) {
    valido = false;
  }

  return valido;
}

export function validarCuestionario(
  data: unknown,
): { valido: true; data: Cuestionario } | { valido: false; errores: string[] } {
  const errores: string[] = [];
  const cuestionario = esRegistro(data) && tienePropiedad(data, "cuestionario")
    ? data.cuestionario
    : data;

  if (!esCuestionario(cuestionario, errores)) {
    return { valido: false, errores };
  }
  return { valido: true, data: cuestionario };
}