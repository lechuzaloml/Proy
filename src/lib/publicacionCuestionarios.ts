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
): string {
  return `${window.location.origin}/c/${encodeURIComponent(empresaId)}/${encodeURIComponent(cuestionarioId)}`;
}

export interface ResultadoPublicacion {
  usados: number;
  limite: number | null;
}

function leerErrorApi(valor: unknown): string | null {
  if (
    typeof valor === "object" &&
    valor !== null &&
    "error" in valor &&
    typeof valor.error === "string"
  ) {
    return valor.error;
  }
  return null;
}

export async function cambiarPublicacionCuestionario(
  accion: "publicar" | "despublicar",
  empresaId: string,
  cuestionarioId: string,
  idToken: string,
): Promise<ResultadoPublicacion> {
  const respuesta = await fetch(`/api/cuestionarios/${accion}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ empresaId, cuestionarioId }),
  });
  const cuerpo: unknown = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(
      leerErrorApi(cuerpo) ?? "No se pudo cambiar la publicación del cuestionario.",
    );
  }
  if (
    typeof cuerpo !== "object" ||
    cuerpo === null ||
    !("usados" in cuerpo) ||
    typeof cuerpo.usados !== "number" ||
    !("limite" in cuerpo) ||
    (typeof cuerpo.limite !== "number" && cuerpo.limite !== null)
  ) {
    throw new Error("El servidor devolvió un contador de cuestionarios no válido.");
  }
  return { usados: cuerpo.usados, limite: cuerpo.limite };
}
