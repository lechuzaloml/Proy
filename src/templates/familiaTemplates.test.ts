import { describe, expect, it } from "vitest";
import { catalogoTemplates } from "./catalogo";
import { presentacionesTemplates } from "../config/presentacionTemplates";
import {
  calcularResultado,
  type RespuestasCuestionario,
} from "../logic/calcularResultado";
import { calcularPerfilSecciones } from "../logic/calcularPerfilSecciones";
import type { Cuestionario, Pregunta } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";

function familiaRespuesta(pregunta: Pregunta): string {
  if (pregunta.tipo !== "opcion_multiple") {
    return pregunta.tipo;
  }

  if (pregunta.opciones.length === 2) {
    const opciones = pregunta.opciones.map(({ texto }) => texto).sort();
    if (opciones[0] === "No" && opciones[1] === "Sí") {
      return "si_no";
    }
    throw new Error("Las preguntas de dos opciones deben ser exactamente Sí/No.");
  }

  if (pregunta.opciones.length >= 3) {
    return "opcion_multiple";
  }

  throw new Error("Una pregunta de opción múltiple necesita al menos tres opciones.");
}

function obtenerPuntajeMaximo(cuestionario: Cuestionario): number {
  return cuestionario.preguntas.reduce((total, pregunta) => {
    if (!pregunta.participa_scoring) {
      return total;
    }
    if (pregunta.tipo === "opcion_multiple") {
      return (
        total +
        Math.max(...pregunta.opciones.map(({ puntos }) => puntos ?? 0))
      );
    }
    if (pregunta.tipo === "escala") {
      return (
        total +
        Math.max(
          ...Object.entries(pregunta.puntos_por_valor ?? {})
            .filter(([valor]) => {
              const numero = Number(valor);
              return numero >= pregunta.escala.min && numero <= pregunta.escala.max;
            })
            .map(([, puntos]) => puntos),
        )
      );
    }
    return total;
  }, 0);
}

function obtenerRespuestasDePuntajeMaximo(
  cuestionario: Cuestionario,
): RespuestasCuestionario {
  return Object.fromEntries(
    cuestionario.preguntas.map((pregunta, indice) => {
      if (pregunta.tipo === "opcion_multiple") {
        const indiceOpcion = pregunta.participa_scoring
          ? pregunta.opciones.reduce(
              (mejor, opcion, actual) =>
                (opcion.puntos ?? 0) >
                (pregunta.opciones[mejor]?.puntos ?? 0)
                  ? actual
                  : mejor,
              0,
            )
          : 0;
        return [indice, { tipo: "opcion_multiple", indiceOpcion }];
      }
      if (pregunta.tipo === "escala") {
        const puntos = pregunta.puntos_por_valor ?? {};
        const valor = pregunta.participa_scoring
          ? Number(
              Object.entries(puntos)
                .filter(([, puntaje]) => typeof puntaje === "number")
                .reduce(
                  (mejor, [candidato, puntaje]) =>
                    puntaje > (puntos[mejor] ?? Number.NEGATIVE_INFINITY)
                      ? candidato
                      : mejor,
                  String(pregunta.escala.min),
                ),
            )
          : pregunta.escala.min;
        return [indice, { tipo: "escala", valor }];
      }
      return [indice, { tipo: "abierta", valor: "Respuesta de prueba" }];
    }),
  );
}

describe("familias de respuesta de los templates de biblioteca", () => {
  const templates = catalogoTemplates
    .map(({ metadata, configuracion }) => {
      const validacion = validarCuestionario(configuracion);
      if (!validacion.valido) {
        throw new Error(
          `${metadata.nombre}: ${validacion.errores.join("\n")}`,
        );
      }
      return { metadata, cuestionario: validacion.data };
    })
    .filter(
      ({ cuestionario }) =>
        ![
          "diagnostico-inicial",
          "ser-empresario",
          "merkatics",
          "caso-nuevo-coach-calificacion-leads",
          "demo-registro-evento-pagina-completa",
        ].includes(cuestionario.id),
    );

  it("mantiene una sola familia de respuesta en cada template", () => {
    expect(templates).toHaveLength(8);

    for (const { metadata, cuestionario } of templates) {
      const familias = new Set(
        cuestionario.preguntas.map(familiaRespuesta),
      );
      expect(
        [...familias],
        `${metadata.nombre} contiene más de una familia de respuesta`,
      ).toHaveLength(1);
      expect(presentacionesTemplates[cuestionario.id]?.familia).toBe(
        [...familias][0],
      );
    }
  });

  it("conserva al menos dos preguntas en cada sección", () => {
    for (const { metadata, cuestionario } of templates) {
      for (const seccion of cuestionario.secciones ?? []) {
        const preguntasDeSeccion = cuestionario.preguntas.filter(
          (pregunta) => pregunta.seccion === seccion,
        );
        expect(
          preguntasDeSeccion.length,
          `${metadata.nombre}: la sección "${seccion}" necesita dos preguntas`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("valida los puntajes máximos, reglas continuas y scoring explícito", () => {
    for (const { metadata, cuestionario } of templates) {
      expect(metadata.usa_scoring).toBe(cuestionario.usa_scoring);

      if (!cuestionario.usa_scoring) {
        expect(cuestionario.resultado.tipo).toBe("fijo");
        continue;
      }

      for (const pregunta of cuestionario.preguntas) {
        if (!pregunta.participa_scoring) {
          continue;
        }
        if (pregunta.tipo === "opcion_multiple") {
          expect(
            pregunta.opciones.every(
              (opcion) => typeof opcion.puntos === "number",
            ),
            `${metadata.nombre}: todas las opciones puntuadas deben declarar puntos`,
          ).toBe(true);
          expect(
            new Set(pregunta.opciones.map(({ puntos }) => puntos)).size,
            `${metadata.nombre}: cada respuesta debe tener un puntaje explícito`,
          ).toBeGreaterThan(1);
        } else if (pregunta.tipo === "escala") {
          for (
            let valor = pregunta.escala.min;
            valor <= pregunta.escala.max;
            valor += 1
          ) {
            expect(
              pregunta.puntos_por_valor?.[String(valor)],
              `${metadata.nombre}: falta puntaje para la escala ${valor}`,
            ).toBeTypeOf("number");
          }
        } else {
          throw new Error(
            `${metadata.nombre}: una pregunta abierta participa en scoring`,
          );
        }
      }

      const puntajeMaximo = obtenerPuntajeMaximo(cuestionario);
      const reglas = cuestionario.reglas_scoring;
      expect(reglas[0]?.puntaje_min).toBe(0);
      for (let indice = 1; indice < reglas.length; indice += 1) {
        expect(reglas[indice]?.puntaje_min).toBe(
          (reglas[indice - 1]?.puntaje_max ?? -1) + 1,
        );
      }
      expect(reglas.at(-1)?.puntaje_max).toBe(puntajeMaximo);
      expect(
        Math.abs((reglas[0]?.puntaje_max ?? -1) + 1 - puntajeMaximo * 0.35),
      ).toBeLessThanOrEqual(puntajeMaximo * 0.1);
      expect(
        Math.abs((reglas[1]?.puntaje_max ?? -1) + 1 - puntajeMaximo * 0.7),
      ).toBeLessThanOrEqual(puntajeMaximo * 0.1);
    }
  });

  it("mantiene resultados y perfiles completos en todas las secciones", () => {
    for (const { metadata, cuestionario } of templates) {
      const respuestas = obtenerRespuestasDePuntajeMaximo(cuestionario);
      const perfil = calcularPerfilSecciones(cuestionario, respuestas);
      const resultado = calcularResultado(cuestionario, respuestas);

      expect(
        perfil,
        `${metadata.nombre}: se deben calcular todas las dimensiones`,
      ).toHaveLength(cuestionario.secciones?.length ?? 0);
      expect(
        perfil.every(({ porcentaje, totalPreguntas }) =>
          porcentaje === 100 && totalPreguntas >= 2,
        ),
        `${metadata.nombre}: las dimensiones deben completar su figura`,
      ).toBe(true);

      if (cuestionario.usa_scoring) {
        expect(resultado.estado).toBe("ok");
        if (resultado.estado === "ok" && resultado.tipo === "segmentado") {
          expect(resultado.puntajeTotal).toBe(
            obtenerPuntajeMaximo(cuestionario),
          );
          expect(resultado.segmento).toBe(
            cuestionario.reglas_scoring.at(-1)?.segmento,
          );
        }
      } else {
        expect(resultado).toEqual({
          estado: "ok",
          tipo: "fijo",
          resultado: cuestionario.resultado,
        });
      }
    }
  });
});
