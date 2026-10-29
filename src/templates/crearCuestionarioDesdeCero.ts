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
    bienvenida: {
      habilitada: true,
      titulo: "Diagnóstico inicial de crecimiento",
      descripcion: "Antes de empezar, te haremos unas preguntas para entender mejor tu situación actual y darte unas recomendaciones útiles.",
      textoBoton: "Iniciar diagnóstico",
    },
    resultado: {
      tipo: "fijo",
      contenido: "Gracias por completar el cuestionario.",
    },
  };
}
