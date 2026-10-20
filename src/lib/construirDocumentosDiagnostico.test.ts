import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import type { Cuestionario, Lead } from "../types/model";
import { construirDocumentosDiagnostico } from "./construirDocumentosDiagnostico";

const cuestionario = diagnosticoInicial as Cuestionario;
const contacto: Pick<Lead, "nombre" | "correo" | "telefono"> = {
  nombre: " Ana ",
  correo: " ANA@EXAMPLE.COM ",
  telefono: " 5551234567 ",
};
const fecha = Timestamp.fromDate(new Date("2026-10-16T12:00:00.000Z"));

describe("construirDocumentosDiagnostico", () => {
  it("construye únicamente los campos autorizados y normaliza el correo", () => {
    const documentos = construirDocumentosDiagnostico({
      id: "intento-1",
      contacto,
      cuestionario,
      respuestas: {
        0: { tipo: "opcion_multiple", indiceOpcion: 0 },
        1: { tipo: "opcion_multiple", indiceOpcion: 3 },
        2: { tipo: "escala", valor: 4 },
        6: { tipo: "abierta", valor: "  Mejorar captación  " },
      },
      puntajeTotal: 6,
      segmento: "proceso_por_construir",
      templateRecomendadoId: "templates/assessment.json",
      planRecomendadoId: "plan-inicial",
      consentimientoAceptado: true,
      fecha,
    });

    expect(Object.keys(documentos.lead).sort()).toEqual([
      "nombre",
      "correo",
      "telefono",
      "consentimiento",
      "origen",
      "estado",
      "ultimaActividadEn",
      "ultimoDiagnosticoId",
      "ultimoPorcentaje",
      "ultimoSegmento",
      "creadoEn",
    ].sort());
    expect(documentos.lead).toMatchObject({
      nombre: "Ana",
      correo: "ana@example.com",
      ultimoDiagnosticoId: "intento-1",
      estado: "nuevo",
    });
    expect(Object.keys(documentos.diagnostico).sort()).toEqual([
      "leadId",
      "cuestionarioId",
      "versionId",
      "respuestas",
      "puntajeTotal",
      "puntajeMaximo",
      "porcentaje",
      "segmento",
      "puntajePorDimension",
      "templateRecomendadoId",
      "planRecomendadoId",
      "completadoEn",
    ].sort());
    expect(documentos.diagnostico).toMatchObject({
      leadId: "intento-1",
      cuestionarioId: "clear-ia-diagnostico-inicial",
      versionId: "v1",
      puntajeTotal: 6,
      puntajeMaximo: 20,
      porcentaje: 30,
      respuestas: {
        "tipo-negocio": {
          pregunta: "¿Qué tipo de negocio describes mejor?",
          tipo: "opcion_multiple",
          seccion: "Tu negocio",
          valor: 0,
          valorLegible: "Servicios profesionales o consultoría",
        },
        "prioridad-crecimiento": {
          valor: "Mejorar captación",
          valorLegible: "Mejorar captación",
        },
      },
    });
    expect(JSON.stringify(documentos)).not.toContain("undefined");
    expect(documentos.lead).not.toHaveProperty("ultimaCalificacion");
    expect(documentos.diagnostico).not.toHaveProperty("calificacionComercial");
  });

  it("no construye documentos sin consentimiento afirmativo", () => {
    expect(() =>
      construirDocumentosDiagnostico({
        id: "intento-1",
        contacto,
        cuestionario,
        respuestas: {},
        puntajeTotal: 0,
        segmento: "proceso_por_construir",
        templateRecomendadoId: "",
        planRecomendadoId: "",
        consentimientoAceptado: false,
        fecha,
      }),
    ).toThrow("Se requiere consentimiento");
  });

  it("omite respuestas no válidas y campos recomendados vacíos", () => {
    const documentos = construirDocumentosDiagnostico({
      id: "intento-2",
      contacto,
      cuestionario,
      respuestas: {
        0: { tipo: "opcion_multiple", indiceOpcion: 99 },
      },
      puntajeTotal: 0,
      segmento: "proceso_por_construir",
      templateRecomendadoId: "",
      planRecomendadoId: "",
      consentimientoAceptado: true,
      fecha,
    });

    expect(documentos.diagnostico.respuestas).toEqual({});
    expect(documentos.diagnostico).not.toHaveProperty("templateRecomendadoId");
    expect(documentos.diagnostico).not.toHaveProperty("planRecomendadoId");
  });
});
