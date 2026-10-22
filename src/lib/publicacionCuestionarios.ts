import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";
import type { RespuestasCuestionario } from "../logic/calcularResultado";

const REGION = "us-central1";

function obtenerFunctions() {
  if (!firebaseApp) {
    throw new Error("Firebase no está configurado.");
  }
  return getFunctions(firebaseApp, REGION);
}

export async function gestionarPublicacionCopia(
  empresaId: string,
  cuestionarioId: string,
  accion: "publicar" | "despublicar",
): Promise<{ estado: "publicado"; versionId: string } | { estado: "borrador" }> {
  const callable = httpsCallable<
    { empresaId: string; cuestionarioId: string; accion: "publicar" | "despublicar" },
    { estado: "publicado"; versionId: string } | { estado: "borrador" }
  >(obtenerFunctions(), "gestionarPublicacionCopia");
  const respuesta = await callable({ empresaId, cuestionarioId, accion });
  return respuesta.data;
}

export async function enviarCopiaPublicada(
  datos: {
    empresaId: string;
    cuestionarioId: string;
    versionId: string;
    submissionId: string;
    contacto: { nombre: string; correo: string; telefono: string };
    respuestas: RespuestasCuestionario;
    consentimientoAceptado: true;
  },
): Promise<void> {
  const callable = httpsCallable<typeof datos, { success: boolean }>(
    obtenerFunctions(),
    "enviarCopiaPublicada",
  );
  const respuesta = await callable(datos);
  if (respuesta.data.success !== true) {
    throw new Error("No se pudo confirmar el envío.");
  }
}

export function urlCopiaPublicada(
  empresaId: string,
  cuestionarioId: string,
  versionId: string,
): string {
  return `${window.location.origin}/c/${encodeURIComponent(empresaId)}/${encodeURIComponent(cuestionarioId)}/${encodeURIComponent(versionId)}`;
}
