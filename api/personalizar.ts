import { procesarPersonalizacion } from "../server/personalizar.js";

const LIMITE_CUERPO = 32 * 1024;

function respuestaJson(
  status: number,
  body: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return respuestaJson(405, {
        error: "Este endpoint solo acepta solicitudes POST.",
      });
    }

    const texto = await request.text();
    if (new TextEncoder().encode(texto).byteLength > LIMITE_CUERPO) {
      return respuestaJson(413, {
        error: "La solicitud excede el tamaño permitido.",
      });
    }

    let body: unknown;
    try {
      body = JSON.parse(texto);
    } catch {
      return respuestaJson(400, {
        error: "El cuerpo de la solicitud no es JSON válido.",
      });
    }

    const resultado = await procesarPersonalizacion(body);
    return respuestaJson(resultado.status, resultado.body);
  },
};
