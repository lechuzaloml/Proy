import type { Cuestionario, Lead } from "../types/model";
import type { RespuestasCuestionario } from "../logic/calcularResultado";
import {
  VERSION_AVISO_PRIVACIDAD,
} from "../config/privacidad";
import type { DocumentoLead } from "../types/documentoLead";
import type { FieldValue, Timestamp } from "firebase/firestore";

interface EntradaDocumentoLead {
  contacto: Pick<Lead, "nombre" | "correo" | "telefono">;
  cuestionario: Cuestionario;
  respuestas: RespuestasCuestionario;
  puntaje: number;
  segmento: string;
  templateRecomendadoId: string;
  planRecomendado: string;
  consentimientoAceptado: boolean;
  consentimientoFecha: FieldValue | Timestamp;
  creadoEn: FieldValue | Timestamp;
}

export function construirDocumentoLead(
  entrada: EntradaDocumentoLead,
): DocumentoLead {
  if (entrada.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para construir el documento.");
  }

  const respuestas: Record<string, string> = {};
  entrada.cuestionario.preguntas.forEach((pregunta, indice) => {
    const respuesta = entrada.respuestas[indice];
    if (!respuesta) {
      return;
    }

    let valor: string;
    if (
      pregunta.tipo === "opcion_multiple" &&
      respuesta.tipo === "opcion_multiple"
    ) {
      const opcion = pregunta.opciones[respuesta.indiceOpcion];
      if (!opcion) {
        return;
      }
      valor = opcion.texto;
    } else if (
      pregunta.tipo === "escala" &&
      respuesta.tipo === "escala"
    ) {
      valor = String(respuesta.valor);
    } else if (pregunta.tipo === "abierta" && respuesta.tipo === "abierta") {
      valor = respuesta.valor.trim();
    } else {
      return;
    }

    respuestas[pregunta.id] = valor;
  });

  return {
    nombre: entrada.contacto.nombre.trim(),
    correo: entrada.contacto.correo.trim(),
    telefono: entrada.contacto.telefono.trim(),
    consentimiento: {
      aceptado: true,
      version: VERSION_AVISO_PRIVACIDAD,
      fecha: entrada.consentimientoFecha,
    },
    cuestionarioId: entrada.cuestionario.id,
    respuestas,
    puntaje: entrada.puntaje,
    segmento: entrada.segmento,
    templateRecomendadoId: entrada.templateRecomendadoId,
    planRecomendado: entrada.planRecomendado,
    estado: "nuevo",
    creadoEn: entrada.creadoEn,
  };
}
