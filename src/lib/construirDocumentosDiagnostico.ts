import type { Cuestionario, Lead } from "../types/model";
import type { RespuestasCuestionario } from "../logic/calcularResultado";
import { calcularPerfilSecciones } from "../logic/calcularPerfilSecciones";
import {
  VERSION_AVISO_PRIVACIDAD,
} from "../config/privacidad";
import {
  CUESTIONARIO_ID,
  VERSION_ID,
} from "../config/firebaseDatos";
import type {
  DocumentoDiagnostico,
  DocumentoLeadEmpresa,
  MarcaTiempoFirestore,
  RespuestaDiagnostico,
} from "../types/documentosFirestore";

export interface EntradaDocumentosDiagnostico {
  id: string;
  contacto: Pick<Lead, "nombre" | "correo" | "telefono">;
  cuestionario: Cuestionario;
  respuestas: RespuestasCuestionario;
  puntajeTotal: number;
  segmento: string;
  templateRecomendadoId: string;
  planRecomendadoId: string;
  consentimientoAceptado: boolean;
  fecha: MarcaTiempoFirestore;
}

export interface DocumentosDiagnostico {
  lead: DocumentoLeadEmpresa;
  diagnostico: DocumentoDiagnostico;
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
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }

  const porcentaje = entrada.puntajeTotal > 0
    ? Math.round((entrada.puntajeTotal / obtenerPuntajeMaximo(entrada.cuestionario)) * 100)
    : 0;

  return {
    nombre: entrada.contacto.nombre.trim(),
    correo: entrada.contacto.correo.trim().toLowerCase(),
    telefono: entrada.contacto.telefono.trim(),
    consentimiento: {
      aceptado: true,
      version: VERSION_AVISO_PRIVACIDAD,
      fecha: entrada.fecha,
    },
    origen: "diagnostico-inicial",
    estado: "nuevo",
    ultimaActividadEn: entrada.fecha,
    ultimoDiagnosticoId: entrada.id,
    ultimoPorcentaje: Math.min(100, Math.max(0, porcentaje)),
    ultimoSegmento: entrada.segmento,
    creadoEn: entrada.fecha,
  };
}

export function construirDocumentoDiagnostico(
  entrada: EntradaDocumentosDiagnostico,
): DocumentoDiagnostico {
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }

  const puntajeMaximo = obtenerPuntajeMaximo(entrada.cuestionario);
  const porcentaje = puntajeMaximo > 0
    ? Math.round((entrada.puntajeTotal / puntajeMaximo) * 100)
    : 0;
  const puntajePorDimension = Object.fromEntries(
    calcularPerfilSecciones(entrada.cuestionario, entrada.respuestas)
      .filter(({ modo }) => modo === "puntaje")
      .map(({ nombre, porcentaje: valor }) => [nombre, valor]),
  );

  return {
    leadId: entrada.id,
    cuestionarioId: CUESTIONARIO_ID,
    versionId: VERSION_ID,
    respuestas: respuestaLegible(entrada.cuestionario, entrada.respuestas),
    puntajeTotal: entrada.puntajeTotal,
    puntajeMaximo,
    porcentaje: Math.min(100, Math.max(0, porcentaje)),
    segmento: entrada.segmento,
    puntajePorDimension,
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
