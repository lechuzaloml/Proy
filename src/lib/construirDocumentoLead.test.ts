import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import type { Cuestionario, Lead } from "../types/model";
import { construirDocumentoLead } from "./construirDocumentoLead";

const cuestionario = diagnosticoInicial as Cuestionario;
const contacto: Pick<Lead, "nombre" | "correo" | "telefono"> = {
  nombre: "Ana",
  correo: "ana@example.com",
  telefono: "5551234567",
};
const timestamp = Timestamp.fromDate(new Date("2026-10-16T12:00:00.000Z"));

describe("construirDocumentoLead", () => {
  it("construye solo los campos permitidos y guarda respuestas legibles por ID", () => {
    const documento = construirDocumentoLead({
      contacto,
      cuestionario,
      respuestas: {
        0: { tipo: "opcion_multiple", indiceOpcion: 0 },
        1: { tipo: "opcion_multiple", indiceOpcion: 3 },
        2: { tipo: "escala", valor: 4 },
        6: { tipo: "abierta", valor: "  Mejorar captación  " },
      },
      puntaje: 9,
      segmento: "proceso_en_consolidacion",
      templateRecomendadoId: "template",
      planRecomendado: "Plan Pro",
      consentimientoAceptado: true,
      consentimientoFecha: timestamp,
      creadoEn: timestamp,
    });

    expect(Object.keys(documento).sort()).toEqual(
      [
        "nombre",
        "correo",
        "telefono",
        "consentimiento",
        "cuestionarioId",
        "respuestas",
        "puntaje",
        "segmento",
        "templateRecomendadoId",
        "planRecomendado",
        "estado",
        "creadoEn",
      ].sort(),
    );
    expect(documento.respuestas).toEqual({
      "tipo-negocio": "Servicios profesionales o consultoría",
      "captacion-leads": "Usamos canales definidos con cierta regularidad",
      "calificacion-prospectos": "4",
      "prioridad-crecimiento": "Mejorar captación",
    });
    expect(documento.consentimiento).toEqual({
      aceptado: true,
      version: "provisional-v1",
      fecha: timestamp,
    });
    expect(documento.estado).toBe("nuevo");
  });

  it("no permite construir el documento sin consentimiento afirmativo", () => {
    expect(() =>
      construirDocumentoLead({
        contacto,
        cuestionario,
        respuestas: {},
        puntaje: 0,
        segmento: "proceso_por_construir",
        templateRecomendadoId: "template",
        planRecomendado: "Plan Inicial",
        consentimientoAceptado: false,
        consentimientoFecha: timestamp,
        creadoEn: timestamp,
      }),
    ).toThrow("Se requiere consentimiento");
  });
});
