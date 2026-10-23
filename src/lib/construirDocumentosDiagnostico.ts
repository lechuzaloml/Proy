import type { Cuestionario, Lead } from "../types/model";
import type { RespuestasCuestionario } from "../logic/calcularResultado";
import type { ResultadoCalculado } from "../logic/calcularResultado";
import { calcularPerfilSecciones } from "../logic/calcularPerfilSecciones";
import {
  VERSION_AVISO_PRIVACIDAD,
} from "../config/privacidad";
import type {
  DocumentoDiagnostico,
  DocumentoLeadEmpresa,
  MarcaTiempoFirestore,
  RespuestaDiagnostico,
} from "../types/documentosFirestore";
import type { Resultado } from "../types/model";


export interface EntradaDocumentosDiagnostico {
  empresaId: string;
  id: string;
  contacto: Pick<Lead, "nombre" | "correo" | "telefono">;
  cuestionario: Cuestionario;
  cuestionarioId: string;
  versionId: string;
  respuestas: RespuestasCuestionario;
  puntajeTotal?: number;
  segmento?: string;
  templateRecomendadoId: string;
  planRecomendadoId: string;
  origen?: string;
  resultado?: Resultado;
  consentimientoAceptado: boolean;
  fecha: MarcaTiempoFirestore;
}


export interface DocumentosDiagnostico {
  lead: DocumentoLeadEmpresa;
  diagnostico: DocumentoDiagnostico;
}

export interface EntradaDocumentosCopia {
  empresaId: string;
  id: string;
  contacto: Pick<Lead, "nombre" | "correo" | "telefono">;
  cuestionario: Cuestionario;
  respuestas: RespuestasCuestionario;
  calculo: Extract<ResultadoCalculado, { estado: "ok" }>;
  contenidoPersonalizado: string | null;
  consentimientoAceptado: boolean;
  fecha: MarcaTiempoFirestore;
}

function respuestaLegible(
  cuestionario: Cuestionario,
  respuestas: RespuestasCuestionario,
): Record<string, RespuestaDiagnostico> {
  const documentos: Record<string, RespuestaDiagnostico> = {};

  cuestionario.preguntas.forEach((pregunta, indice) => {
    const respuesta = respuestas[indice];
    if (!respuesta) {
      return;
    }

    let valor: string | number;
    let valorLegible: string;
    if (
      pregunta.tipo === "opcion_multiple" &&
      respuesta.tipo === "opcion_multiple"
    ) {
      const opcion = pregunta.opciones[respuesta.indiceOpcion];
      if (!opcion) {
        return;
      }
      valor = respuesta.indiceOpcion;
      valorLegible = opcion.texto;
    } else if (
      pregunta.tipo === "escala" &&
      respuesta.tipo === "escala"
    ) {
      valor = respuesta.valor;
      valorLegible = String(respuesta.valor);
    } else if (pregunta.tipo === "abierta" && respuesta.tipo === "abierta") {
      valor = respuesta.valor.trim();
      valorLegible = valor;
    } else {
      return;
    }

    documentos[pregunta.id] = {
      pregunta: pregunta.texto,
      tipo: pregunta.tipo,
      ...(pregunta.seccion ? { seccion: pregunta.seccion } : {}),
      valor,
      valorLegible,
    };
  });

  return documentos;
}

function obtenerPuntajeMaximo(cuestionario: Cuestionario): number {
  return cuestionario.preguntas.reduce((total, pregunta) => {
    if (!cuestionario.usa_scoring || !pregunta.participa_scoring) {
      return total;
    }

    if (pregunta.tipo === "opcion_multiple") {
      return total + Math.max(0, ...pregunta.opciones.map(({ puntos }) => puntos ?? 0));
    }

    if (pregunta.tipo === "escala") {
      const maximo = Object.entries(pregunta.puntos_por_valor ?? {})
        .filter(([valor]) => {
          const numero = Number(valor);
          return numero >= pregunta.escala.min && numero <= pregunta.escala.max;
        })
        .reduce((max, [, puntos]) => Math.max(max, puntos), 0);
      return total + maximo;
    }

    return total;
  }, 0);
}

export function construirDocumentoLeadEmpresa(
  entrada: EntradaDocumentosDiagnostico,
): DocumentoLeadEmpresa {
  if (!entrada.empresaId.trim()) {
    throw new Error("Se requiere una empresa para construir el documento.");
  }
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }

  const puntajeTotal = entrada.cuestionario.usa_scoring
    ? entrada.puntajeTotal
    : undefined;
  const puntajeMaximo = entrada.cuestionario.usa_scoring
    ? obtenerPuntajeMaximo(entrada.cuestionario)
    : 0;
  const porcentaje = puntajeTotal !== undefined && puntajeMaximo > 0
    ? Math.min(100, Math.max(0, Math.round((puntajeTotal / puntajeMaximo) * 100)))
    : undefined;

  return {
    nombre: entrada.contacto.nombre.trim(),
    correo: entrada.contacto.correo.trim().toLowerCase(),
    telefono: entrada.contacto.telefono.trim(),
    consentimiento: {
      aceptado: true,
      version: VERSION_AVISO_PRIVACIDAD,
      fecha: entrada.fecha,
    },
    origen: entrada.origen ?? "diagnostico-inicial",
    estado: "nuevo",
    ultimaActividadEn: entrada.fecha,
    ultimoDiagnosticoId: entrada.id,
    ...(porcentaje !== undefined ? { ultimoPorcentaje: porcentaje } : {}),
    ...(entrada.cuestionario.usa_scoring && entrada.segmento
      ? { ultimoSegmento: entrada.segmento }
      : {}),
    creadoEn: entrada.fecha,
  };
}

export function construirDocumentoDiagnostico(
  entrada: EntradaDocumentosDiagnostico,
): DocumentoDiagnostico {
  if (!entrada.empresaId.trim()) {
    throw new Error("Se requiere una empresa para construir el documento.");
  }
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }

  const puntajeTotal = entrada.cuestionario.usa_scoring
    ? entrada.puntajeTotal
    : undefined;
  const puntajeMaximo = entrada.cuestionario.usa_scoring
    ? obtenerPuntajeMaximo(entrada.cuestionario)
    : 0;
  const porcentaje = puntajeTotal !== undefined && puntajeMaximo > 0
    ? Math.min(100, Math.max(0, Math.round((puntajeTotal / puntajeMaximo) * 100)))
    : undefined;
  const puntajePorDimension = Object.fromEntries(
    calcularPerfilSecciones(entrada.cuestionario, entrada.respuestas)
      .filter(({ modo }) => modo === "puntaje")
      .map(({ nombre, porcentaje: valor }) => [nombre, valor]),
  );

  return {
    leadId: entrada.id,
    cuestionarioId: entrada.cuestionarioId,
    versionId: entrada.versionId,
    respuestas: respuestaLegible(entrada.cuestionario, entrada.respuestas),
    ...(entrada.resultado ? { resultado: entrada.resultado } : {}),
    ...(puntajeTotal !== undefined ? { puntajeTotal } : {}),
    ...(puntajeMaximo > 0 ? { puntajeMaximo } : {}),
    ...(porcentaje !== undefined ? { porcentaje } : {}),
    ...(entrada.cuestionario.usa_scoring && entrada.segmento
      ? { segmento: entrada.segmento }
      : {}),
    ...(entrada.cuestionario.usa_scoring &&
      Object.keys(puntajePorDimension).length > 0
      ? { puntajePorDimension }
      : {}),
    ...(entrada.templateRecomendadoId
      ? { templateRecomendadoId: entrada.templateRecomendadoId }
      : {}),
    ...(entrada.planRecomendadoId
      ? { planRecomendadoId: entrada.planRecomendadoId }
      : {}),
    completadoEn: entrada.fecha,
  };
}

export function construirDocumentosDiagnostico(
  entrada: EntradaDocumentosDiagnostico,
): DocumentosDiagnostico {
  return {
    lead: construirDocumentoLeadEmpresa(entrada),
    diagnostico: construirDocumentoDiagnostico(entrada),
  };
}

export function construirDocumentosCopia(
  entrada: EntradaDocumentosCopia,
): DocumentosDiagnostico {
  if (!entrada.empresaId.trim()) {
    throw new Error("Se requiere una empresa para construir el documento.");
  }
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }
  if (!entrada.cuestionario.id.startsWith("personalizado-")) {
    throw new Error("Solo se pueden guardar envíos de copias personalizadas.");
  }

  const resultadoGuardado = entrada.calculo.tipo === "segmentado"
    ? {
        tipo: "por_segmento" as const,
        resultados: [{
          ...entrada.calculo.resultado,
          contenido: entrada.contenidoPersonalizado ??
            entrada.calculo.resultado.contenido,
        }],
      }
    : {
        tipo: "fijo" as const,
        contenido: entrada.contenidoPersonalizado ??
          entrada.calculo.resultado.contenido,
        ...("cta" in entrada.calculo.resultado && entrada.calculo.resultado.cta
          ? { cta: entrada.calculo.resultado.cta }
          : {}),
      };
  const puntajeTotal = entrada.calculo.tipo === "segmentado"
    ? entrada.calculo.puntajeTotal
    : undefined;
  const puntajeMaximo = entrada.calculo.tipo === "segmentado"
    ? obtenerPuntajeMaximo(entrada.cuestionario)
    : 0;
  const porcentaje = puntajeMaximo > 0 && puntajeTotal !== undefined
    ? Math.min(100, Math.max(0, Math.round((puntajeTotal / puntajeMaximo) * 100)))
    : undefined;
  const puntajePorDimension = entrada.calculo.tipo === "segmentado"
    ? Object.fromEntries(
        calcularPerfilSecciones(entrada.cuestionario, entrada.respuestas)
          .filter(({ modo }) => modo === "puntaje")
          .map(({ nombre, porcentaje: valor }) => [nombre, valor]),
      )
    : undefined;

  return {
    lead: {
      nombre: entrada.contacto.nombre.trim(),
      correo: entrada.contacto.correo.trim().toLowerCase(),
      telefono: entrada.contacto.telefono.trim(),
      consentimiento: {
        aceptado: true,
        version: VERSION_AVISO_PRIVACIDAD,
        fecha: entrada.fecha,
      },
      origen: "copia-clear-ia",
      estado: "nuevo",
      ultimaActividadEn: entrada.fecha,
      ultimoDiagnosticoId: entrada.id,
      ...(porcentaje !== undefined ? { ultimoPorcentaje: porcentaje } : {}),
      ...(entrada.calculo.tipo === "segmentado"
        ? { ultimoSegmento: entrada.calculo.segmento }
        : {}),
      creadoEn: entrada.fecha,
    },
    diagnostico: {
      leadId: entrada.id,
      cuestionarioId: entrada.cuestionario.id,
      respuestas: respuestaLegible(entrada.cuestionario, entrada.respuestas),
      resultado: resultadoGuardado,
      ...(puntajeTotal !== undefined
        ? { puntajeTotal }
        : {}),
      ...(puntajeMaximo > 0 ? { puntajeMaximo } : {}),
      ...(porcentaje !== undefined ? { porcentaje } : {}),
      ...(entrada.calculo.tipo === "segmentado"
        ? { segmento: entrada.calculo.segmento }
        : {}),
      ...(puntajePorDimension && Object.keys(puntajePorDimension).length > 0
        ? { puntajePorDimension }
        : {}),
      completadoEn: entrada.fecha,
    },
  };
}
