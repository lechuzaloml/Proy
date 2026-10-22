import { validarCuestionario } from "../validation/validarCuestionario";
import type { Cuestionario } from "../types/model";
import type { MarcaTiempoFirestore } from "../types/documentosFirestore";

export interface DocumentoCuestionarioGuardado {
  id: string;
  nombre: string;
  estado: "borrador";
  configuracion: Cuestionario;
  creadoPor: string;
  creadoEn: MarcaTiempoFirestore;
  actualizadoEn: MarcaTiempoFirestore;
  publicacion?: {
    estado: "publicado" | "borrador";
    versionId?: string;
    publicadoEn?: MarcaTiempoFirestore;
    publicadoPor?: string;
  };
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
  if (valor.estado !== "borrador") {
    errores.push("Las copias nuevas deben permanecer en estado borrador.");
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
  let publicacion: DocumentoCuestionarioGuardado["publicacion"];
  if (valor.publicacion !== undefined) {
    if (!esObjeto(valor.publicacion) ||
      (valor.publicacion.estado !== "publicado" &&
        valor.publicacion.estado !== "borrador")) {
      errores.push("El estado de publicación no es válido.");
    } else if (
      valor.publicacion.estado === "publicado" &&
      (typeof valor.publicacion.versionId !== "string" ||
        !valor.publicacion.versionId ||
        valor.publicacion.publicadoEn == null ||
        typeof valor.publicacion.publicadoPor !== "string")
    ) {
      errores.push("La publicación requiere versión, fecha y autor.");
    } else {
      publicacion = valor.publicacion as DocumentoCuestionarioGuardado["publicacion"];
    }
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
      estado: "borrador",
      configuracion: validacion.data,
      creadoPor: (valor.creadoPor as string).trim(),
      creadoEn: valor.creadoEn as MarcaTiempoFirestore,
      actualizadoEn: valor.actualizadoEn as MarcaTiempoFirestore,
      ...(publicacion ? { publicacion } : {}),
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
