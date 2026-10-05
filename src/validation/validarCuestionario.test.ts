import { describe, expect, it } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "./validarCuestionario";

const fixture: unknown = casoNuevo;

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonarCuestionario(): Record<string, unknown> {
  const copia: unknown = structuredClone(fixture);
  if (!esRegistro(copia)) {
    throw new Error("El fixture debe ser un objeto cuestionario.");
  }
  return copia;
}

function preguntaEn(
  cuestionario: Record<string, unknown>,
  indice: number,
): Record<string, unknown> {
  const preguntas = cuestionario.preguntas;
  if (!Array.isArray(preguntas) || !esRegistro(preguntas[indice])) {
    throw new Error(`No existe preguntas[${indice}] en el fixture.`);
  }
  return preguntas[indice];
}

function erroresDe(data: unknown, textoEsperado: string): void {
  const resultado = validarCuestionario(data);
  expect(resultado.valido).toBe(false);
  if (!resultado.valido) {
    expect(resultado.errores.join(" ")).toContain(textoEsperado);
  }
}

describe("validarCuestionario", () => {
  it("acepta el caso nuevo y devuelve un Cuestionario", () => {
    const resultado = validarCuestionario(fixture);

    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      const data: Cuestionario = resultado.data;
      expect(data.id).toBe("caso-nuevo-coach-calificacion-leads");
      expect(data.usa_scoring).toBe(true);
    }
  });

  it("rechaza el formato envuelto en una propiedad cuestionario", () => {
    erroresDe({ cuestionario: fixture }, "cuestionario.id debe ser un texto no vacío");
  });

  it("acepta un cuestionario válido sin la propiedad secciones", () => {
    const data = clonarCuestionario();
    delete data.secciones;

    const resultado = validarCuestionario(data);
    expect(resultado.valido).toBe(true);
  });

  it("rechaza usa_scoring distinto de un booleano", () => {
    const data = clonarCuestionario();
    data.usa_scoring = "no_demostrado";
    erroresDe(data, "usa_scoring debe ser exactamente true o false");
  });

  it("rechaza reglas_scoring presentes sin scoring", () => {
    const data = clonarCuestionario();
    data.usa_scoring = false;
    erroresDe(data, "sin scoring no debe incluir reglas_scoring");
  });

  it("rechaza resultado fijo con scoring activo", () => {
    const data = clonarCuestionario();
    data.resultado = { tipo: "fijo", contenido: "Resultado" };
    erroresDe(data, 'con scoring requiere resultado.tipo="por_segmento"');
  });

  it("rechaza resultado por segmento con scoring desactivado", () => {
    const data = clonarCuestionario();
    data.usa_scoring = false;
    data.resultado = { tipo: "por_segmento", resultados: [] };
    erroresDe(data, 'sin scoring requiere resultado.tipo="fijo"');
  });

  it("rechaza un tipo de pregunta no contemplado", () => {
    const data = clonarCuestionario();
    preguntaEn(data, 0).tipo = "multiple_opcion";
    erroresDe(data, "preguntas[0].tipo debe ser");
  });

  it("decisión 2: rechaza participa_scoring=true cuando el scoring global está apagado", () => {
    const data = clonarCuestionario();
    data.usa_scoring = false;
    preguntaEn(data, 3).participa_scoring = true;
    erroresDe(data, "participa en scoring, pero el cuestionario tiene usa_scoring=false");
  });

  it("rechaza una posición de contacto inválida", () => {
    const data = clonarCuestionario();
    data.posicion_contacto = "medio";
    erroresDe(data, 'posicion_contacto debe ser "inicio" o "final"');
  });

  it("rechaza reglas_scoring vacío con un mensaje específico", () => {
    const data = clonarCuestionario();
    data.reglas_scoring = [];
    erroresDe(data, "Un cuestionario con scoring necesita reglas de scoring");
  });

  it.each(["ausentes", "vacías"]) (
    "rechaza opciones %s en una pregunta de opción múltiple",
    (estado) => {
      const data = clonarCuestionario();
      const pregunta = preguntaEn(data, 0);
      if (estado === "ausentes") {
        delete pregunta.opciones;
      } else {
        pregunta.opciones = [];
      }
      erroresDe(data, "la pregunta de opción múltiple no tiene una estructura válida");
    },
  );

  it("rechaza campos obligatorios ausentes en una pregunta", () => {
    const data = clonarCuestionario();
    delete preguntaEn(data, 0).id;
    erroresDe(data, "preguntas[0].id debe ser un texto no vacío");
  });

  it("rechaza puntos de opción que no sean numéricos", () => {
    const data = clonarCuestionario();
    const pregunta = preguntaEn(data, 0);
    if (!Array.isArray(pregunta.opciones) || !esRegistro(pregunta.opciones[0])) {
      throw new Error("El fixture debe incluir opciones con estructura válida.");
    }
    pregunta.opciones[0].puntos = "10";
    erroresDe(data, "opciones[0].puntos debe ser numérico");
  });

  it("rechaza extremos de escala incompletos", () => {
    const data = clonarCuestionario();
    preguntaEn(data, 2).escala = { min: 1 };
    erroresDe(data, "preguntas[2].escala.max debe ser numérico");
  });

  it("rechaza puntos por valor con contenido de tipo incorrecto", () => {
    const data = clonarCuestionario();
    preguntaEn(data, 2).puntos_por_valor = [0, 5, 10];
    erroresDe(data, "puntos_por_valor debe ser un objeto de valores numéricos");
  });

  it("rechaza reglas de scoring con límites no numéricos", () => {
    const data = clonarCuestionario();
    if (!Array.isArray(data.reglas_scoring) || !esRegistro(data.reglas_scoring[0])) {
      throw new Error("El fixture debe incluir reglas de scoring.");
    }
    data.reglas_scoring[0].puntaje_min = "cero";
    erroresDe(data, "reglas_scoring[0].puntaje_min debe ser numérico");
  });

  it("rechaza CTA sin acción", () => {
    const data = clonarCuestionario();
    const resultado = data.resultado;
    if (!esRegistro(resultado) || !Array.isArray(resultado.resultados) || !esRegistro(resultado.resultados[0])) {
      throw new Error("El fixture debe incluir resultados por segmento.");
    }
    resultado.resultados[0].cta = { texto: "Ver recursos" };
    erroresDe(data, "resultado.resultados[0].cta.accion debe ser un texto no vacío");
  });

  it("rechaza datos que no sean objetos", () => {
    erroresDe(null, "cuestionario debe ser un objeto");
  });
});