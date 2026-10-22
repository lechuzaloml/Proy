import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import type { Cuestionario, Lead } from "../types/model";
import { construirDocumentosDiagnostico } from "./construirDocumentosDiagnostico";
import { construirDocumentosCopia } from "./construirDocumentosDiagnostico";
import { calcularResultado } from "../logic/calcularResultado";
import { cambiarModoScoring } from "../templates/editarCuestionario";

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

  it("construye un envío de copia con scoring, resultado y clasificación calculada", () => {
    const copia = structuredClone(cuestionario);
    copia.id = "personalizado-con-scoring";
    const respuestas = {
      0: { tipo: "opcion_multiple" as const, indiceOpcion: 2 },
      1: { tipo: "opcion_multiple" as const, indiceOpcion: 2 },
      2: { tipo: "escala" as const, valor: 5 },
      4: { tipo: "opcion_multiple" as const, indiceOpcion: 0 },
    };
    const calculo = calcularResultado(copia, respuestas);
    if (calculo.estado !== "ok") {
      throw new Error("El fixture debe producir un resultado válido.");
    }
    const documentos = construirDocumentosCopia({
      id: "intento-copia-score",
      contacto,
      cuestionario: copia,
      respuestas,
      calculo,
      contenidoPersonalizado: "Resultado personalizado.",
      consentimientoAceptado: true,
      fecha,
    });

    expect(documentos.lead).toMatchObject({
      origen: "copia-clear-ia",
      ultimoSegmento: "proceso_por_construir",
      ultimoPorcentaje: 30,
    });
    expect(documentos.diagnostico).toMatchObject({
      cuestionarioId: "personalizado-con-scoring",
      puntajeTotal: 6,
      segmento: "proceso_por_construir",
      resultado: {
        tipo: "por_segmento",
        resultados: [{
          segmento: "proceso_por_construir",
          contenido: "Resultado personalizado.",
        }],
      },
    });
    expect(documentos.diagnostico).not.toHaveProperty("versionId");
  });

  it("guarda copia sin scoring sin puntaje ni segmento", () => {
    const copiaScoring = structuredClone(cuestionario);
    copiaScoring.id = "personalizado-sin-scoring";
    const copia = cambiarModoScoring(copiaScoring, false);
    const respuestas = {
      0: { tipo: "opcion_multiple" as const, indiceOpcion: 1 },
      6: { tipo: "abierta" as const, valor: "Respuesta libre" },
    };
    const calculo = calcularResultado(copia, respuestas);
    if (calculo.estado !== "ok" || calculo.tipo !== "fijo") {
      throw new Error("El fixture sin scoring debe producir un resultado fijo.");
    }
    const documentos = construirDocumentosCopia({
      id: "intento-copia-sin-score",
      contacto,
      cuestionario: copia,
      respuestas,
      calculo,
      contenidoPersonalizado: null,
      consentimientoAceptado: true,
      fecha,
    });

    expect(documentos.lead.origen).toBe("copia-clear-ia");
    expect(documentos.lead).not.toHaveProperty("ultimoPorcentaje");
    expect(documentos.lead).not.toHaveProperty("ultimoSegmento");
    expect(documentos.diagnostico).toMatchObject({
      cuestionarioId: "personalizado-sin-scoring",
      respuestas: {
        "tipo-negocio": { valorLegible: "Comercio o venta de productos" },
        "prioridad-crecimiento": { valorLegible: "Respuesta libre" },
      },
      resultado: {
        tipo: "fijo",
        contenido: copia.resultado.contenido,
      },
    });
    expect(documentos.diagnostico).not.toHaveProperty("puntajeTotal");
    expect(documentos.diagnostico).not.toHaveProperty("puntajeMaximo");
    expect(documentos.diagnostico).not.toHaveProperty("porcentaje");
    expect(documentos.diagnostico).not.toHaveProperty("segmento");
  });

  it("rechaza envíos de copias sin consentimiento o con IDs no personalizados", () => {
    const copia = structuredClone(cuestionario);
    copia.id = "personalizado-no-consentido";
    const calculo = calcularResultado(copia, {});
    if (calculo.estado !== "ok") {
      throw new Error("El fixture debe producir un resultado válido.");
    }

    expect(() => construirDocumentosCopia({
      id: "intento-sin-consentimiento",
      contacto,
      cuestionario: copia,
      respuestas: {},
      calculo,
      contenidoPersonalizado: null,
      consentimientoAceptado: false,
      fecha,
    })).toThrow("Se requiere consentimiento");
    expect(() => construirDocumentosCopia({
      id: "intento-no-copia",
      contacto,
      cuestionario: { ...copia, id: "diagnostico-inicial" },
      respuestas: {},
      calculo,
      contenidoPersonalizado: null,
      consentimientoAceptado: true,
      fecha,
    })).toThrow("Solo se pueden guardar envíos de copias");
  });
});
