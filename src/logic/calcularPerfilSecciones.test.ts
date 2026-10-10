import { describe, expect, it } from "vitest";
import ciberseguridad from "../../templates/assessments/evaluacion-ciberseguridad.json";
import liderazgo from "../../templates/assessments/evaluacion-liderazgo.json";
import madurezTecnologica from "../../templates/assessments/diagnostico-madurez-tecnologica.json";
import preparacionComercial from "../../templates/assessments/diagnostico-preparacion-comercial.json";
import onboardingAgencia from "../../templates/forms/onboarding-para-agencia.json";
import registroMasterclass from "../../templates/events/registro-a-masterclass.json";
import saludFinanciera from "../../templates/surveys/diagnostico-salud-financiera.json";
import marketingDigital from "../../templates/quizzes/test-madurez-marketing-digital.json";
import { validarCuestionario } from "../validation/validarCuestionario";
import { calcularPerfilSecciones } from "./calcularPerfilSecciones";
import type { Cuestionario } from "../types/model";

function obtenerCuestionario(data: unknown = liderazgo): Cuestionario {
  const validacion = validarCuestionario(data);
  if (!validacion.valido) {
    throw new Error(validacion.errores.join("\n"));
  }
  return validacion.data;
}

describe("calcularPerfilSecciones", () => {
  it("genera al menos dos dimensiones para cada template puntuado", () => {
    const templates = [
      ciberseguridad,
      liderazgo,
      madurezTecnologica,
      preparacionComercial,
      marketingDigital,
    ];

    for (const template of templates) {
      const perfil = calcularPerfilSecciones(obtenerCuestionario(template), {});
      expect(perfil.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("genera avance por sección en los demás templates sin scoring", () => {
    const templates = [
      onboardingAgencia,
      registroMasterclass,
      saludFinanciera,
    ];

    for (const template of templates) {
      const perfil = calcularPerfilSecciones(obtenerCuestionario(template), {});
      expect(perfil.length).toBeGreaterThanOrEqual(2);
      expect(perfil.every(({ modo }) => modo === "avance")).toBe(true);
    }
  });

  it("calcula porcentajes por sección e ignora preguntas abiertas", () => {
    const cuestionario = obtenerCuestionario();
    const perfil = calcularPerfilSecciones(cuestionario, {
      0: { tipo: "escala", valor: 5 },
      1: { tipo: "opcion_multiple", indiceOpcion: 1 },
      2: { tipo: "escala", valor: 3 },
      3: { tipo: "opcion_multiple", indiceOpcion: 0 },
      4: { tipo: "abierta", valor: "Respuesta libre" },
    });

    expect(perfil).toEqual([
      {
        nombre: "Comunicación y dirección",
        modo: "puntaje",
        porcentaje: 74,
        respondidas: 2,
        totalPreguntas: 2,
      },
      {
        nombre: "Desarrollo del equipo",
        modo: "puntaje",
        porcentaje: 24,
        respondidas: 2,
        totalPreguntas: 2,
      },
    ]);
  });

  it("cuenta las preguntas sin responder como puntos pendientes", () => {
    const perfil = calcularPerfilSecciones(obtenerCuestionario(), {
      0: { tipo: "escala", valor: 5 },
    });

    expect(perfil[0]).toEqual({
      nombre: "Comunicación y dirección",
      modo: "puntaje",
      porcentaje: 50,
      respondidas: 1,
      totalPreguntas: 2,
    });
  });

  it("no devuelve dimensiones para cuestionarios sin scoring", () => {
    const cuestionario: Cuestionario = {
      id: "sin-scoring",
      cliente: "Cuestionario de prueba",
      estado: "prueba",
      posicion_contacto: "final",
      preguntas: [],
      usa_scoring: false,
      resultado: { tipo: "fijo", contenido: "Resultado de prueba." },
    };

    expect(calcularPerfilSecciones(cuestionario, {})).toEqual([]);
  });

  it("calcula el avance de las preguntas respondidas en cada sección", () => {
    const perfil = calcularPerfilSecciones(obtenerCuestionario(onboardingAgencia), {
      0: { tipo: "abierta", valor: "Descripción de la organización" },
      2: { tipo: "abierta", valor: "Aumentar las ventas" },
      3: { tipo: "opcion_multiple", indiceOpcion: 1 },
    });

    expect(perfil).toEqual([
      {
        nombre: "Tu organización",
        modo: "avance",
        porcentaje: 50,
        respondidas: 1,
        totalPreguntas: 2,
      },
      {
        nombre: "Proyecto y objetivos",
        modo: "avance",
        porcentaje: 100,
        respondidas: 2,
        totalPreguntas: 2,
      },
      {
        nombre: "Marca y coordinación",
        modo: "avance",
        porcentaje: 0,
        respondidas: 0,
        totalPreguntas: 3,
      },
    ]);
  });
});
