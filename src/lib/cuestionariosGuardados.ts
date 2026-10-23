import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { EMPRESA_ID } from "../config/firebaseDatos";
import { db } from "./firebase";
import {
  construirDocumentoCuestionarioGuardado,
  validarDocumentoCuestionarioGuardado,
  type DocumentoCuestionarioGuardado,
} from "./documentoCuestionario";

function obtenerBaseDatos() {
  if (!db) {
    throw new Error("Firebase no está configurado; no se pueden cargar copias.");
  }
  return db;
}

function referenciaColeccion() {
  return collection(obtenerBaseDatos(), "empresas", EMPRESA_ID, "cuestionarios");
}

function validarDocumentoFirestore(
  id: string,
  datos: unknown,
): DocumentoCuestionarioGuardado {
  const resultado = validarDocumentoCuestionarioGuardado(datos);
  if (!resultado.valido || !resultado.data || resultado.data.id !== id) {
    throw new Error(
      `No se pudo cargar la copia "${id}": ${resultado.errores.join(" ") || "el ID no coincide con el documento."}`,
    );
  }
  return resultado.data;
}

export async function crearCuestionarioGuardado(
  id: string,
  nombre: string,
  configuracion: unknown,
  creadoPor: string,
): Promise<DocumentoCuestionarioGuardado> {
  const referencia = doc(referenciaColeccion(), id);
  const resultado = construirDocumentoCuestionarioGuardado({
    id,
    nombre,
    configuracion,
    creadoPor,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  if (!resultado.valido || !resultado.data) {
    throw new Error(`No se pudo preparar la copia: ${resultado.errores.join(" ")}`);
  }

  await setDoc(referencia, resultado.data);
  return resultado.data;
}

export async function listarCuestionariosGuardados():
Promise<DocumentoCuestionarioGuardado[]> {
  const snapshot = await getDocsFromServer(referenciaColeccion());
  return snapshot.docs
    .filter(({ id }) => id.startsWith("personalizado-"))
    .map((documento) => validarDocumentoFirestore(
      documento.id,
      documento.data(),
    ));
}

export async function leerCuestionarioGuardado(
  id: string,
): Promise<DocumentoCuestionarioGuardado | null> {
  const referencia = doc(referenciaColeccion(), id);
  const snapshot = await getDocFromServer(referencia);
  if (!snapshot.exists()) {
    return null;
  }
  return validarDocumentoFirestore(snapshot.id, snapshot.data());
}

export async function actualizarCuestionarioGuardado(
  id: string,
  nombre: string,
  configuracion: unknown,
): Promise<DocumentoCuestionarioGuardado> {
  const database = obtenerBaseDatos();
  const referencia = doc(database, "empresas", EMPRESA_ID, "cuestionarios", id);
  const existente = await getDocFromServer(referencia);
  if (!existente.exists()) {
    throw new Error("La copia que intentas guardar ya no existe.");
  }
  const documentoExistente = validarDocumentoFirestore(
    existente.id,
    existente.data(),
  );
  const resultado = construirDocumentoCuestionarioGuardado({
    id,
    nombre,
    configuracion,
    creadoPor: documentoExistente.creadoPor,
    creadoEn: documentoExistente.creadoEn,
    actualizadoEn: serverTimestamp(),
  });
  if (!resultado.valido || !resultado.data) {
    throw new Error(`No se pudieron validar los cambios: ${resultado.errores.join(" ")}`);
  }

  await updateDoc(referencia, {
    nombre: resultado.data.nombre,
    configuracion: resultado.data.configuracion,
    actualizadoEn: resultado.data.actualizadoEn,
  });
  return {
    ...resultado.data,
    estado: documentoExistente.estado,
    ...(documentoExistente.versionActualId
      ? { versionActualId: documentoExistente.versionActualId }
      : {}),
  };
}

export async function eliminarCuestionarioGuardado(id: string): Promise<void> {
  if (!id.startsWith("personalizado-")) {
    throw new Error("Solo se pueden eliminar copias personalizadas.");
  }
  await deleteDoc(doc(
    obtenerBaseDatos(),
    "empresas",
    EMPRESA_ID,
    "cuestionarios",
    id,
  ));
}
