import { validarCuestionario } from "../validation/validarCuestionario";
import type { Cuestionario } from "../types/model";
import type { MarcaTiempoFirestore } from "../types/documentosFirestore";

export interface DocumentoCuestionarioGuardado {
  id: string;
  nombre: string;
  estado: "borrador" | "publicado";
  versionActualId?: string;
  configuracion: Cuestionario;
  creadoPor: string;
  creadoEn: MarcaTiempoFirestore;
  actualizadoEn: MarcaTiempoFirestore;
}

export interface ResultadoDocumentoCuestionario {
  valido: boolean;
  data?: DocumentoCuestionarioGuardado;
  errores: string[];
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function validarDocumentoCuestionarioGuardado(
  valor: unknown,
): ResultadoDocumentoCuestionario {
  if (!esObjeto(valor)) {
    return { valido: false, errores: ["El documento debe ser un objeto."] };
  }

  const errores: string[] = [];
  if (
    typeof valor.id !== "string" ||
    !/^personalizado-[a-zA-Z0-9_-]{1,120}$/.test(valor.id)
  ) {
    errores.push("El ID debe tener el prefijo personalizado- y ser válido.");
  }
  if (
    typeof valor.nombre !== "string" ||
    valor.nombre.trim().length === 0 ||
    valor.nombre.length > 120
  ) {
    errores.push("El nombre debe contener entre 1 y 120 caracteres.");
  }
  if (valor.estado !== "borrador" && valor.estado !== "publicado") {
    errores.push("El estado de la copia no es válido.");
  }
  if (
    valor.versionActualId !== undefined &&
    (typeof valor.versionActualId !== "string" ||
      valor.versionActualId.length < 1 ||
      valor.versionActualId.length > 60)
  ) {
    errores.push("El ID de la versión actual no es válido.");
  }
  if (
    valor.estado === "publicado" &&
    (typeof valor.versionActualId !== "string" ||
      valor.versionActualId.length < 1 ||
      valor.versionActualId.length > 60)
  ) {
    errores.push("Un cuestionario publicado requiere una versión actual válida.");
  }
  if (typeof valor.creadoPor !== "string" || !valor.creadoPor.trim()) {
    errores.push("El creador es obligatorio.");
  }
  if (valor.creadoEn === undefined || valor.creadoEn === null) {
    errores.push("La fecha de creación es obligatoria.");
  }
  if (valor.actualizadoEn === undefined || valor.actualizadoEn === null) {
    errores.push("La fecha de actualización es obligatoria.");
  }
  const validacion = validarCuestionario(valor.configuracion);
  if (!validacion.valido) {
    errores.push(...validacion.errores);
  } else if (typeof valor.id === "string" && validacion.data.id !== valor.id) {
    errores.push("El ID de la configuración debe coincidir con el ID del documento.");
  }

  if (errores.length > 0 || !validacion.valido) {
    return { valido: false, errores };
  }

  return {
    valido: true,
    errores: [],
    data: {
      id: valor.id as string,
      nombre: (valor.nombre as string).trim(),
      estado: valor.estado === "publicado" ? "publicado" : "borrador",
      ...(typeof valor.versionActualId === "string"
        ? { versionActualId: valor.versionActualId }
        : {}),
      configuracion: validacion.data,
      creadoPor: (valor.creadoPor as string).trim(),
      creadoEn: valor.creadoEn as MarcaTiempoFirestore,
      actualizadoEn: valor.actualizadoEn as MarcaTiempoFirestore,
    },
  };
}

export function construirDocumentoCuestionarioGuardado(
  entrada: Omit<DocumentoCuestionarioGuardado, "configuracion" | "estado"> & {
    configuracion: unknown;
  },
): ResultadoDocumentoCuestionario {
  const validacionConfiguracion = validarCuestionario(entrada.configuracion);
  if (!validacionConfiguracion.valido) {
    return {
      valido: false,
      errores: validacionConfiguracion.errores,
    };
  }

  const configuracion = structuredClone(validacionConfiguracion.data);
  configuracion.id = entrada.id;
  configuracion.cliente = entrada.nombre.trim();

  return validarDocumentoCuestionarioGuardado({
    ...entrada,
    estado: "borrador",
    configuracion,
  });
}
