import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import {
  construirDocumentoCuestionarioGuardado,
  validarDocumentoCuestionarioGuardado,
} from "./documentoCuestionario";

const ahora = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

function entrada(configuracion: unknown = diagnosticoInicial) {
  return {
    id: "personalizado-prueba-1",
    nombre: "  Copia de diagnóstico  ",
    configuracion,
    creadoPor: "editor@example.invalid",
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

describe("documento de cuestionario guardado", () => {
  it("construye el documento con la configuración completa y el ID de destino", () => {
    const resultado = construirDocumentoCuestionarioGuardado(entrada());

    expect(resultado.valido).toBe(true);
    if (!resultado.valido || !resultado.data) {
      throw new Error("Se esperaba un documento válido.");
    }
    expect(resultado.data).toMatchObject({
      id: "personalizado-prueba-1",
      nombre: "Copia de diagnóstico",
      estado: "borrador",
      creadoPor: "editor@example.invalid",
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
    expect(resultado.data.configuracion).toEqual({
      ...diagnosticoInicial,
      id: "personalizado-prueba-1",
      cliente: "Copia de diagnóstico",
    });
    expect(resultado.data.configuracion.preguntas).toEqual(
      diagnosticoInicial.preguntas,
    );
    expect(resultado.data.configuracion.cliente).toBe("Copia de diagnóstico");
    expect(resultado.data.configuracion).not.toBe(diagnosticoInicial);
    expect(resultado.data.configuracion.preguntas).not.toBe(
      diagnosticoInicial.preguntas,
    );
    expect(diagnosticoInicial.id).not.toBe("personalizado-prueba-1");

    resultado.data.configuracion.preguntas[0].texto = "Texto modificado";
    expect(diagnosticoInicial.preguntas[0].texto).not.toBe("Texto modificado");
  });

  it("rechaza IDs no personalizados, nombres vacíos y configuración inválida", () => {
    const base = entrada();
    const erroresId = validarDocumentoCuestionarioGuardado({
      ...base,
      id: "template-original",
    });
    const erroresNombre = validarDocumentoCuestionarioGuardado({
      ...base,
      nombre: " ",
    });
    const erroresCuestionario = construirDocumentoCuestionarioGuardado(
      entrada({ id: "", preguntas: [] }),
    );

    expect(erroresId.valido).toBe(false);
    expect(erroresId.errores).toContain(
      "El ID de la configuración debe coincidir con el ID del documento.",
    );
    expect(erroresNombre.valido).toBe(false);
    expect(erroresCuestionario.valido).toBe(false);
  });

  it("rechaza un documento sin metadatos mínimos", () => {
    const resultado = validarDocumentoCuestionarioGuardado({
      ...entrada(),
      estado: "borrador",
      creadoPor: "",
      creadoEn: null,
      actualizadoEn: null,
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.errores).toContain("El creador es obligatorio.");
    expect(resultado.errores).toContain("La fecha de creación es obligatoria.");
    expect(resultado.errores).toContain(
      "La fecha de actualización es obligatoria.",
    );
  });

  it("valida el estado publicado y requiere la versión actual", () => {
    const borrador = construirDocumentoCuestionarioGuardado(entrada());
    if (!borrador.valido || !borrador.data) {
      throw new Error("Se esperaba un documento válido.");
    }
    const publicado = validarDocumentoCuestionarioGuardado({
      ...borrador.data,
      estado: "publicado",
      versionActualId: "version-1",
    });
    const sinVersion = validarDocumentoCuestionarioGuardado({
      ...borrador.data,
      estado: "publicado",
    });

    expect(publicado.valido).toBe(true);
    expect(publicado.data?.versionActualId).toBe("version-1");
    expect(sinVersion.valido).toBe(false);
    expect(sinVersion.errores).toContain(
      "Un cuestionario publicado requiere una versión actual válida.",
    );
  });
});
