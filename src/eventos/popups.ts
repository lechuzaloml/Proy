import { Timestamp } from "firebase/firestore";
import {
  DIAS_GRACIA,
  MAX_DIAS_EVENTO_FIRESTORE,
} from "../config/popups";

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
  fechaEvento?: Timestamp;
  venceEn?: Timestamp;
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
  hora: string;
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
    ...(documento.fechaEvento instanceof Timestamp
      ? { fechaEvento: documento.fechaEvento }
      : {}),
    ...(documento.venceEn instanceof Timestamp
      ? { venceEn: documento.venceEn }
      : {}),
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
  const fechaEvento = crearTimestampFechaEvento(
    formulario.fecha,
    formulario.hora,
  );
  if (
    (estado === "pendiente" || estado === "publicado") &&
    !fechaEvento
  ) {
    throw new Error("La fecha y hora del evento son obligatorias.");
  }
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
    ...(fechaEvento
      ? {
          fechaEvento,
          venceEn: calcularVenceEn(fechaEvento),
        }
      : {}),
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
  ahora: Date = new Date(),
  exigirFechaEvento = false,
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
    formulario.insignia.trim().length > 60
  ) {
    errores.push("longitud");
  }
  const fechaEvento = crearTimestampFechaEvento(
    formulario.fecha,
    formulario.hora,
  );
  if (
    (exigirFechaEvento && !fechaEvento) ||
    (Boolean(formulario.fecha) !== Boolean(formulario.hora)) ||
    ((formulario.fecha || formulario.hora) && !fechaEvento) ||
    (fechaEvento && (
      !esFechaEventoHoyOFutura(fechaEvento.toDate(), ahora) ||
      !venceDentroDelLimiteDeReglas(fechaEvento, ahora)
    ))
  ) {
    errores.push("fechaEvento");
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

export function calcularVenceEn(
  fechaEvento: Timestamp,
  diasGracia = DIAS_GRACIA,
): Timestamp {
  if (!Number.isInteger(diasGracia) || diasGracia < 0) {
    throw new Error("Los días de gracia deben ser un entero no negativo.");
  }
  const fecha = fechaEvento.toDate();
  const venceEn = new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate() + diasGracia,
    23,
    59,
    59,
    999,
  );
  return Timestamp.fromDate(venceEn);
}

export function estaVencido(
  popup: Pick<PopupEvento, "venceEn">,
  ahora: Date | Timestamp = new Date(),
): boolean {
  if (!(popup.venceEn instanceof Timestamp)) {
    return true;
  }
  const ahoraMs = ahora instanceof Timestamp ? ahora.toMillis() : ahora.getTime();
  return popup.venceEn.toMillis() <= ahoraMs;
}

export function formatearFechaEvento(fechaEvento?: Timestamp): string {
  if (!(fechaEvento instanceof Timestamp)) {
    return "";
  }
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(fechaEvento.toDate());
}

export function obtenerFechaFormulario(fechaEvento?: Timestamp): string {
  if (!(fechaEvento instanceof Timestamp)) {
    return "";
  }
  const fecha = fechaEvento.toDate();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${
    String(fecha.getDate()).padStart(2, "0")
  }`;
}

export function obtenerHoraFormulario(fechaEvento?: Timestamp): string {
  if (!(fechaEvento instanceof Timestamp)) {
    return "";
  }
  const fecha = fechaEvento.toDate();
  return `${String(fecha.getHours()).padStart(2, "0")}:${
    String(fecha.getMinutes()).padStart(2, "0")
  }`;
}

export function motivoDescartePopup(
  popup: Pick<
    PopupEvento,
    "estado" | "fechaEvento" | "venceEn" | "cuestionarioId"
  > & {
    id: string;
  },
  empresaActiva: boolean | undefined,
  cuestionarioPublicado: boolean | undefined,
  ahora: Date = new Date(),
): string | null {
  if (popup.estado !== "publicado") {
    return "no está publicado";
  }
  if (!(popup.fechaEvento instanceof Timestamp)) {
    return "no tiene fecha del evento";
  }
  if (!(popup.venceEn instanceof Timestamp)) {
    return "no tiene fecha de vencimiento";
  }
  if (estaVencido(popup, ahora)) {
    return "está vencido";
  }
  if (!empresaActiva) {
    return "la empresa no existe o está inactiva";
  }
  if (!cuestionarioPublicado) {
    return "el cuestionario no está publicado";
  }
  return null;
}

function crearTimestampFechaEvento(fecha: string, hora: string): Timestamp | null {
  const coincidenciaFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const coincidenciaHora = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!coincidenciaFecha || !coincidenciaHora) {
    return null;
  }
  const [, anio, mes, dia] = coincidenciaFecha;
  const [, horas, minutos] = coincidenciaHora;
  const fechaLocal = new Date(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(horas),
    Number(minutos),
  );
  if (
    fechaLocal.getFullYear() !== Number(anio) ||
    fechaLocal.getMonth() !== Number(mes) - 1 ||
    fechaLocal.getDate() !== Number(dia) ||
    fechaLocal.getHours() !== Number(horas) ||
    fechaLocal.getMinutes() !== Number(minutos)
  ) {
    return null;
  }
  return Timestamp.fromDate(fechaLocal);
}

function esFechaEventoHoyOFutura(fechaEvento: Date, ahora: Date): boolean {
  const inicioDeHoy = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
  );
  const diaEvento = new Date(
    fechaEvento.getFullYear(),
    fechaEvento.getMonth(),
    fechaEvento.getDate(),
  );
  return diaEvento >= inicioDeHoy;
}

function venceDentroDelLimiteDeReglas(
  fechaEvento: Timestamp,
  ahora: Date,
): boolean {
  const maximoVenceEn = ahora.getTime() +
    MAX_DIAS_EVENTO_FIRESTORE * 24 * 60 * 60 * 1000;
  return calcularVenceEn(fechaEvento).toMillis() <= maximoVenceEn;
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
  estado: EstadoPopup;
  fechaEvento?: Timestamp;
  venceEn?: Timestamp;
  cuestionarioId: string;
}>(
  popups: T[],
  empresasActivas: ReadonlyMap<string, boolean>,
  cuestionariosPublicados: ReadonlyMap<string, boolean>,
  ahora: Date = new Date(),
): T[] {
  return popups.filter((popup) =>
    motivoDescartePopup(
      popup,
      empresasActivas.get(popup.id),
      cuestionariosPublicados.get(
        `${popup.id}/${popup.cuestionarioId}`,
      ),
      ahora,
    ) === null
  );
}
