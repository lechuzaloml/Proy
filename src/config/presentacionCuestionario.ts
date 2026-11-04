import type { Cuestionario } from "../types/model";

export function contarPreguntas(preguntas: readonly unknown[]): number {
  return preguntas.length;
}

export function estimarMinutos(cantidadPreguntas: number): number {
  return Math.max(1, Math.ceil((cantidadPreguntas * 20) / 60));
}

export function crearPasosCuestionario(
  posicionContacto: Cuestionario["posicion_contacto"],
  usaScoring: Cuestionario["usa_scoring"],
): string[] {
  const preguntas = "Las preguntas";
  const contacto = "Tus datos";
  const ultimoPaso = usaScoring ? "Tu resultado" : "Confirmación";

  return posicionContacto === "inicio"
    ? [contacto, preguntas, ultimoPaso]
    : [preguntas, contacto, ultimoPaso];
}
