import { describe, expect, it } from "vitest";
import type { Cuestionario } from "../../src/types/model";
import { calcularResultado } from "../../src/logic/calcularResultado";
import {
  envioCompletoYaRegistrado,
  usuarioPuedeEditarCuestionario,
  validarDatosEnvioPublico,
  versionPublicadaCoincide,
} from "./submission";

const formulario: Cuestionario = {
  id: "personalizado-sintetico",
  cliente: "Cuestionario sintético",
  estado: "borrador",
  posicion_contacto: "inicio",
  preguntas: [{
    id: "pregunta-1",
    texto: "Pregunta sintética",
    tipo: "opcion_multiple",
    opciones: [{ texto: "Opción A", puntos: 1 }, { texto: "Opción B", puntos: 2 }],
    participa_scoring: true,
  }],
  usa_scoring: true,
  reglas_scoring: [
    { puntaje_min: 0, puntaje_max: 1, segmento: "inicial" },
    { puntaje_min: 2, puntaje_max: 2, segmento: "avanzado" },
  ],
  resultado: {
    tipo: "por_segmento",
    resultados: [
      { segmento: "inicial", contenido: "Resultado inicial." },
      { segmento: "avanzado", contenido: "Resultado avanzado." },
    ],
  },
};

function solicitud(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: "clearia",
    cuestionarioId: formulario.id,
    versionId: "pub-sintetica",
    submissionId: "00000000-0000-4000-8000-000000000001",
    contacto: {
      nombre: "Persona sintética",
      correo: "persona@example.invalid",
      telefono: "5550000000",
    },
    respuestas: { 0: { tipo: "opcion_multiple", indiceOpcion: 1 } },
    consentimientoAceptado: true,
    ...overrides,
  };
}

describe("validación de envíos anónimos de versiones publicadas", () => {
  it("acepta datos tipados y normaliza el correo", () => {
    const entrada = validarDatosEnvioPublico(
      solicitud({ contacto: { nombre: "Ana", correo: " ANA@example.invalid ", telefono: "5550000000" } }),
      formulario,
    );
    expect(entrada.contacto.correo).toBe("ana@example.invalid");
    expect(entrada.cuestionarioId).toBe(formulario.id);
  });

  it("rechaza consentimiento ausente, empresa falsificada y payload fuera del modelo", () => {
    expect(() => validarDatosEnvioPublico(
      solicitud({ consentimientoAceptado: false }),
      formulario,
    )).toThrow(/consentimiento/i);
    expect(() => validarDatosEnvioPublico(
      solicitud({ empresaId: "../otra-empresa" }),
      formulario,
    )).toThrow(/identificadores/i);
    expect(() => validarDatosEnvioPublico(
      solicitud({ respuestas: { 0: { tipo: "opcion_multiple", indiceOpcion: 40 } } }),
      formulario,
    )).toThrow(/respuestas/i);
  });

  it("rechaza respuestas para cuestionarios o versiones diferentes", () => {
    expect(() => validarDatosEnvioPublico(
      solicitud({ cuestionarioId: "personalizado-otro" }),
      formulario,
    )).toThrow(/configuración publicada/i);
    expect(() => validarDatosEnvioPublico(
      solicitud({ versionId: "../borrador" }),
      formulario,
    )).toThrow(/identificadores/i);
  });

  it("acepta el resultado fijo sin asignar puntuación ni segmento", () => {
    const sinScoring: Cuestionario = {
      id: formulario.id,
      cliente: formulario.cliente,
      estado: formulario.estado,
      posicion_contacto: formulario.posicion_contacto,
      preguntas: [{
        id: "pregunta-1",
        texto: "Pregunta sintética",
        tipo: "opcion_multiple",
        opciones: [{ texto: "Opción A" }, { texto: "Opción B" }],
        participa_scoring: false,
      }],
      usa_scoring: false,
      resultado: {
        tipo: "fijo",
        contenido: "Resultado personalizado sin scoring.",
      },
    };
    const entrada = validarDatosEnvioPublico(
      solicitud({ cuestionarioId: sinScoring.id }),
      sinScoring,
    );
    const calculo = calcularResultado(sinScoring, entrada.respuestas);
    expect(calculo).toEqual({
      estado: "ok",
      tipo: "fijo",
      resultado: sinScoring.resultado,
    });
  });

  it("autoriza únicamente la versión publicada actual del cuestionario propietario", () => {
    const empresa = { estado: "activa" };
    const copia = {
      id: formulario.id,
      estado: "borrador",
      publicacion: { estado: "publicado", versionId: "pub-v1" },
    };
    const version = {
      empresaId: "clearia",
      cuestionarioId: formulario.id,
      versionId: "pub-v1",
    };
    expect(versionPublicadaCoincide(
      "clearia", formulario.id, "pub-v1", empresa, copia, version,
    )).toBe(true);
    expect(versionPublicadaCoincide(
      "clearia", formulario.id, "pub-v1", empresa, {
        ...copia,
        publicacion: { estado: "borrador" },
      }, version,
    )).toBe(false);
    expect(versionPublicadaCoincide(
      "otra-empresa", formulario.id, "pub-v1", empresa, copia, version,
    )).toBe(false);
    expect(versionPublicadaCoincide(
      "clearia", formulario.id, "pub-v2", empresa, copia, version,
    )).toBe(false);
  });

  it("reconoce reintentos completos sin sobrescribir pares parciales", () => {
    expect(envioCompletoYaRegistrado(true, true)).toBe(true);
    expect(envioCompletoYaRegistrado(false, false)).toBe(false);
    expect(() => envioCompletoYaRegistrado(true, false)).toThrow(/incompleta/i);
  });

  it("autoriza publicación solo a miembros habilitados de una empresa activa", () => {
    expect(usuarioPuedeEditarCuestionario(
      true,
      false,
      { estado: "activo", rol: "usuario", permisos: { editarCuestionarios: true } },
    )).toBe(true);
    expect(usuarioPuedeEditarCuestionario(
      true,
      false,
      { estado: "activo", rol: "admin", permisos: {} },
    )).toBe(true);
    expect(usuarioPuedeEditarCuestionario(
      false,
      true,
      null,
    )).toBe(false);
    expect(usuarioPuedeEditarCuestionario(
      true,
      false,
      { estado: "inactivo", rol: "admin", permisos: {} },
    )).toBe(false);
    expect(usuarioPuedeEditarCuestionario(
      true,
      false,
      { estado: "activo", rol: "usuario", permisos: { editarCuestionarios: false } },
    )).toBe(false);
  });
});
