import type { Cuestionario } from "../../src/types/model";
import {
  calcularResultado,
  type RespuestasCuestionario,
} from "../../src/logic/calcularResultado";
import { validarCuestionario } from "../../src/validation/validarCuestionario";

export interface DatosEnvioPublico {
  empresaId: string;
  cuestionarioId: string;
  versionId: string;
  submissionId: string;
  contacto: {
    nombre: string;
    correo: string;
    telefono: string;
  };
  respuestas: RespuestasCuestionario;
  consentimientoAceptado: true;
}

export function versionPublicadaCoincide(
  cuestionarioId: string,
  versionId: string,
  empresa: unknown,
  cuestionario: unknown,
): boolean {
  if (!esObjeto(empresa) || !esObjeto(cuestionario)) {
    return false;
  }
  return empresa.estado === "activa" &&
    cuestionario.estado === "publicado" &&
    cuestionario.id === cuestionarioId &&
    cuestionario.versionActualId === versionId;
}

export function envioCompletoYaRegistrado(
  leadExiste: boolean,
  diagnosticoExiste: boolean,
): boolean {
  if (leadExiste && diagnosticoExiste) {
    return true;
  }
  if (leadExiste || diagnosticoExiste) {
    throw new Error("El envío existe de forma incompleta y requiere revisión.");
  }
  return false;
}

const identificadorValido = /^[A-Za-z0-9_-]{1,120}$/;
const correoValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function validarRespuestas(
  cuestionario: Cuestionario,
  respuestas: unknown,
): respuestas is RespuestasCuestionario {
  if (!esObjeto(respuestas) || Object.keys(respuestas).length > cuestionario.preguntas.length) {
    return false;
  }
  return Object.entries(respuestas).every(([indiceTexto, valor]) => {
    const indice = Number(indiceTexto);
    const pregunta = Number.isInteger(indice) && indiceTexto === String(indice)
      ? cuestionario.preguntas[indice]
      : undefined;
    if (!pregunta || !esObjeto(valor)) {
      return false;
    }
    if (pregunta.tipo === "opcion_multiple") {
      return Object.keys(valor).length === 2 &&
        Object.keys(valor).every((clave) => ["tipo", "indiceOpcion"].includes(clave)) &&
        valor.tipo === "opcion_multiple" &&
        Number.isInteger(valor.indiceOpcion) &&
        Number(valor.indiceOpcion) >= 0 &&
        Number(valor.indiceOpcion) < pregunta.opciones.length;
    }
    if (pregunta.tipo === "escala") {
      return Object.keys(valor).length === 2 &&
        Object.keys(valor).every((clave) => ["tipo", "valor"].includes(clave)) &&
        valor.tipo === "escala" &&
        typeof valor.valor === "number" &&
        Number.isFinite(valor.valor) &&
        Number(valor.valor) >= pregunta.escala.min &&
        Number(valor.valor) <= pregunta.escala.max;
    }
    return Object.keys(valor).length === 2 &&
      Object.keys(valor).every((clave) => ["tipo", "valor"].includes(clave)) &&
      valor.tipo === "abierta" &&
      typeof valor.valor === "string" &&
      valor.valor.length <= Math.min(pregunta.limite_caracteres ?? 2000, 10000);
  });
}

export function validarDatosEnvioPublico(
  valor: unknown,
  cuestionario: Cuestionario,
): DatosEnvioPublico {
  if (!esObjeto(valor)) {
    throw new Error("La solicitud de envío no es válida.");
  }
  const camposEsperados = [
    "empresaId",
    "cuestionarioId",
    "versionId",
    "submissionId",
    "contacto",
    "respuestas",
    "consentimientoAceptado",
  ];
  if (
    Object.keys(valor).length !== camposEsperados.length ||
    Object.keys(valor).some((clave) => !camposEsperados.includes(clave))
  ) {
    throw new Error("La solicitud contiene campos no admitidos.");
  }
  const { empresaId, cuestionarioId, versionId, submissionId, contacto } = valor;
  if (
    typeof empresaId !== "string" ||
    !identificadorValido.test(empresaId) ||
    typeof cuestionarioId !== "string" ||
    !/^personalizado-[A-Za-z0-9_-]{1,120}$/.test(cuestionarioId) ||
    typeof versionId !== "string" ||
    !identificadorValido.test(versionId) ||
    typeof submissionId !== "string" ||
    !uuidValido.test(submissionId)
  ) {
    throw new Error("Los identificadores del envío no son válidos.");
  }
  if (
    !esObjeto(contacto) ||
    Object.keys(contacto).length !== 3 ||
    Object.keys(contacto).some((clave) => !["nombre", "correo", "telefono"].includes(clave)) ||
    typeof contacto.nombre !== "string" ||
    contacto.nombre.trim().length < 1 ||
    contacto.nombre.trim().length > 120 ||
    typeof contacto.correo !== "string" ||
    contacto.correo.trim().length > 200 ||
    !correoValido.test(contacto.correo.trim()) ||
    typeof contacto.telefono !== "string" ||
    contacto.telefono.trim().length < 5 ||
    contacto.telefono.trim().length > 30
  ) {
    throw new Error("Los datos de contacto no son válidos.");
  }
  if (valor.consentimientoAceptado !== true) {
    throw new Error("Se requiere consentimiento para enviar las respuestas.");
  }
  const configuracionValida = validarCuestionario(cuestionario);
  if (!configuracionValida.valido || cuestionario.id !== cuestionarioId) {
    throw new Error("La configuración publicada no es válida.");
  }
  if (!validarRespuestas(cuestionario, valor.respuestas)) {
    throw new Error("Las respuestas no coinciden con el cuestionario publicado.");
  }
  const calculo = calcularResultado(cuestionario, valor.respuestas);
  if (calculo.estado !== "ok") {
    throw new Error("No se pudo calcular el resultado del cuestionario.");
  }
  return {
    empresaId,
    cuestionarioId,
    versionId,
    submissionId,
    contacto: {
      nombre: contacto.nombre.trim(),
      correo: contacto.correo.trim().toLowerCase(),
      telefono: contacto.telefono.trim(),
    },
    respuestas: valor.respuestas,
    consentimientoAceptado: true,
  };
}
