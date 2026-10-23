import type { Cuestionario } from "../types/model";

export function crearCuestionarioDesdeCero(): Cuestionario {
  const id = `personalizado-${crypto.randomUUID()}`;
  return {
    id,
    cliente: "Mi cuestionario",
    estado: "borrador",
    posicion_contacto: "inicio",
    preguntas: [],
    usa_scoring: false,
    resultado: {
      tipo: "fijo",
      contenido: "Gracias por completar el cuestionario.",
    },
  };
}
