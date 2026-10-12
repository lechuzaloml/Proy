export interface RespuestaParaPersonalizacion {
  pregunta: string;
  respuesta: string;
}

interface SolicitudPersonalizacion {
  nombreCuestionario: string;
  resultadoBase: string;
  segmento?: string;
  respuestas: RespuestaParaPersonalizacion[];
}

export async function personalizarResultado(
  solicitud: SolicitudPersonalizacion,
): Promise<string> {
  const respuesta = await fetch("/api/personalizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(solicitud),
  });

  const datos: unknown = await respuesta.json();
  if (!respuesta.ok) {
    const mensaje =
      datos &&
      typeof datos === "object" &&
      "error" in datos &&
      typeof datos.error === "string"
        ? datos.error
        : "No se pudo personalizar el resultado.";
    throw new Error(mensaje);
  }

  if (
    !datos ||
    typeof datos !== "object" ||
    !("contenido" in datos) ||
    typeof datos.contenido !== "string" ||
    !datos.contenido.trim()
  ) {
    throw new Error("El servidor devolvió una respuesta de Gemini inválida.");
  }

  return datos.contenido.trim();
}
