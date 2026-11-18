export type EstadoPopup =
  | "borrador"
  | "pendiente"
  | "publicado"
  | "rechazado";

export type RolPopup = "admin" | "propietario" | "plataforma" | "otro";

export interface PuntoPopup {
  titulo: string;
  texto: string;
}

export interface PopupEvento {
  titulo: string;
  insignia?: string;
  resumen: string;
  imagenUrl?: string;
  fecha?: string;
  horarios?: string[];
  anfitrion?: {
    nombre: string;
    fotoUrl?: string;
  };
  puntos?: PuntoPopup[];
  cuestionarioId: string;
  estado: EstadoPopup;
}

export interface PopupListado extends PopupEvento {
  id: string;
  empresaNombre?: string;
}

const ESTADOS_POPUP: EstadoPopup[] = [
  "borrador",
  "pendiente",
  "publicado",
  "rechazado",
];

export interface FormularioPopup {
  titulo: string;
  insignia: string;
  resumen: string;
  imagenUrl: string;
  fecha: string;
  horarios: string[];
  anfitrionNombre: string;
  anfitrionFotoUrl: string;
  puntos: PuntoPopup[];
  cuestionarioId: string;
}

export interface RegistroEvento {
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  horario: string;
  consentimientoAceptado: boolean;
}

export type AccionPopup =
  | "guardar-borrador"
  | "enviar-revision"
  | "volver-borrador"
  | "aprobar"
  | "rechazar"
  | "despublicar";

export function popupDesdeDatos(
  id: string,
  datos: unknown,
  empresaNombre?: string,
): PopupListado | null {
  if (typeof datos !== "object" || datos === null) {
    return null;
  }
  const documento = datos as Record<string, unknown>;
  if (
    typeof documento.titulo !== "string" ||
    typeof documento.resumen !== "string" ||
    typeof documento.cuestionarioId !== "string" ||
    typeof documento.estado !== "string" ||
    !ESTADOS_POPUP.includes(documento.estado as EstadoPopup)
  ) {
    return null;
  }
  const horarios = Array.isArray(documento.horarios)
    ? documento.horarios.filter((valor): valor is string =>
      typeof valor === "string"
    )
    : undefined;
  const puntos = Array.isArray(documento.puntos)
    ? documento.puntos.flatMap((valor): PuntoPopup[] => {
      if (
        typeof valor === "object" &&
        valor !== null &&
        "titulo" in valor &&
        "texto" in valor &&
        typeof valor.titulo === "string" &&
        typeof valor.texto === "string"
      ) {
        return [{ titulo: valor.titulo, texto: valor.texto }];
      }
      return [];
    })
    : undefined;
  const anfitrionData = documento.anfitrion;
  const anfitrion = typeof anfitrionData === "object" &&
      anfitrionData !== null &&
      "nombre" in anfitrionData &&
      typeof anfitrionData.nombre === "string"
    ? {
        nombre: anfitrionData.nombre,
        ...("fotoUrl" in anfitrionData &&
            typeof anfitrionData.fotoUrl === "string"
          ? { fotoUrl: anfitrionData.fotoUrl }
          : {}),
      }
    : undefined;

  return {
    id,
    titulo: documento.titulo,
    resumen: documento.resumen,
    cuestionarioId: documento.cuestionarioId,
    estado: documento.estado as EstadoPopup,
    ...(typeof documento.insignia === "string"
      ? { insignia: documento.insignia }
      : {}),
    ...(typeof documento.imagenUrl === "string"
      ? { imagenUrl: documento.imagenUrl }
      : {}),
    ...(typeof documento.fecha === "string" ? { fecha: documento.fecha } : {}),
    ...(horarios ? { horarios } : {}),
    ...(anfitrion ? { anfitrion } : {}),
    ...(puntos ? { puntos } : {}),
    ...(empresaNombre ? { empresaNombre } : {}),
  };
}

export function crearDocumentoPopup(
  formulario: FormularioPopup,
  estado: EstadoPopup,
): PopupEvento {
  const anfitrion = {
    nombre: formulario.anfitrionNombre.trim(),
    ...(formulario.anfitrionFotoUrl.trim()
      ? { fotoUrl: formulario.anfitrionFotoUrl.trim() }
      : {}),
  };
  return {
    titulo: formulario.titulo.trim(),
    resumen: formulario.resumen.trim(),
    cuestionarioId: formulario.cuestionarioId.trim(),
    estado,
    ...(formulario.insignia.trim()
      ? { insignia: formulario.insignia.trim() }
      : {}),
    ...(formulario.imagenUrl.trim()
      ? { imagenUrl: formulario.imagenUrl.trim() }
      : {}),
    ...(formulario.fecha.trim() ? { fecha: formulario.fecha.trim() } : {}),
    ...(formulario.horarios.some((horario) => horario.trim())
      ? {
          horarios: formulario.horarios
            .filter((horario) => horario.trim())
            .map((horario) => horario.trim()),
        }
      : {}),
    anfitrion,
    ...(formulario.puntos.some((punto) => punto.titulo.trim() || punto.texto.trim())
      ? {
          puntos: formulario.puntos
            .filter((punto) => punto.titulo.trim() || punto.texto.trim())
            .map((punto) => ({
              titulo: punto.titulo.trim(),
              texto: punto.texto.trim(),
            })),
        }
      : {}),
  };
}

export function validarFormularioEvento(
  formulario: FormularioPopup,
): string[] {
  const errores: string[] = [];
  if (!formulario.titulo.trim() || formulario.titulo.trim().length > 80) {
    errores.push("titulo");
  }
  if (!formulario.resumen.trim() || formulario.resumen.trim().length > 300) {
    errores.push("resumen");
  }
  if (
    !formulario.cuestionarioId.trim() ||
    formulario.cuestionarioId.trim().length > 100
  ) {
    errores.push("cuestionarioId");
  }
  if (
    formulario.insignia.trim().length > 60 ||
    formulario.fecha.trim().length > 80
  ) {
    errores.push("longitud");
  }
  if (
    formulario.horarios.length > 4 ||
    formulario.horarios.some((horario) =>
      horario.trim().length > 80
    ) ||
    (formulario.horarios.some((horario) => horario.trim()) &&
      formulario.horarios.some((horario) => !horario.trim()))
  ) {
    errores.push("horarios");
  }
  if (
    formulario.puntos.length > 4 ||
    formulario.puntos.some((punto) =>
      (Boolean(punto.titulo.trim() || punto.texto.trim()) &&
        (!punto.titulo.trim() ||
          punto.titulo.trim().length > 80 ||
          !punto.texto.trim() ||
          punto.texto.trim().length > 300))
    )
  ) {
    errores.push("puntos");
  }
  if (
    formulario.imagenUrl.trim().length > 300 ||
    formulario.anfitrionFotoUrl.trim().length > 300 ||
    !urlHttpsOpcional(formulario.imagenUrl) ||
    !urlHttpsOpcional(formulario.anfitrionFotoUrl)
  ) {
    errores.push("imagenUrl");
  }
  if (
    !formulario.anfitrionNombre.trim() ||
    formulario.anfitrionNombre.trim().length > 80
  ) {
    errores.push("anfitrionNombre");
  }
  return errores;
}

export function validarRegistroEvento(
  registro: RegistroEvento,
  horariosDisponibles: readonly string[],
): string[] {
  const errores: string[] = [];
  if (!registro.nombre.trim() || registro.nombre.trim().length > 120) {
    errores.push("nombre");
  }
  if (!registro.apellido.trim() || registro.apellido.trim().length > 120) {
    errores.push("apellido");
  }
  if (
    registro.correo.trim().length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registro.correo.trim())
  ) {
    errores.push("correo");
  }
  if (
    registro.telefono.trim().length < 5 ||
    registro.telefono.trim().length > 30
  ) {
    errores.push("telefono");
  }
  if (!horariosDisponibles.includes(registro.horario)) {
    errores.push("horario");
  }
  if (!registro.consentimientoAceptado) {
    errores.push("consentimientoAceptado");
  }
  return errores;
}

function urlHttpsOpcional(valor: string): boolean {
  if (!valor.trim()) {
    return true;
  }
  try {
    return new URL(valor).protocol === "https:";
  } catch {
    return false;
  }
}

export function obtenerEstadoTrasEdicion(
  estadoActual: EstadoPopup | null,
): EstadoPopup {
  return estadoActual === "publicado" ? "pendiente" : "borrador";
}

export function transicionarPopup(
  rol: RolPopup,
  estadoActual: EstadoPopup | null,
  accion: AccionPopup,
): EstadoPopup | null {
  if (rol === "admin" || rol === "propietario") {
    if (accion === "guardar-borrador" || accion === "volver-borrador") {
      return "borrador";
    }
    if (accion === "enviar-revision") {
      return "pendiente";
    }
    return null;
  }
  if (rol !== "plataforma") {
    return null;
  }
  if (accion === "aprobar" && estadoActual === "pendiente") {
    return "publicado";
  }
  if (accion === "rechazar" && estadoActual === "pendiente") {
    return "rechazado";
  }
  if (accion === "despublicar" && estadoActual === "publicado") {
    return "borrador";
  }
  return null;
}

export function filtrarPopupsPublicadosActivos<T extends {
  id: string;
  estado: string;
}>(
  popups: T[],
  empresasActivas: ReadonlyMap<string, boolean>,
): T[] {
  return popups.filter((popup) =>
    popup.estado === "publicado" && empresasActivas.get(popup.id) === true
  );
}
