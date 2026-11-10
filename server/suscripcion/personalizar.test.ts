import { afterEach, describe, expect, it, vi } from "vitest";

const { crearInteraccion } = vi.hoisted(() => ({
  crearInteraccion: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: crearInteraccion };
  },
}));

import personalizar from "../../api/personalizar.ts";

const solicitudValida = {
  nombreCuestionario: "Evaluación sintética",
  resultadoBase: "Resultado base para la auditoría.",
  respuestas: [{ pregunta: "Pregunta sintética", respuesta: "Respuesta sintética" }],
};

const claveAnterior = process.env.GEMINI_API_KEY;

afterEach(() => {
  crearInteraccion.mockReset();
  if (claveAnterior === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = claveAnterior;
  }
});

describe("API /api/personalizar con Gemini simulado", () => {
  it("BRECHA: una petición anónima llega a Gemini sin límite por empresa o IP", async () => {
    process.env.GEMINI_API_KEY = "gemini_fake_test_key";
    crearInteraccion.mockResolvedValue({
      status: "completed",
      output_text: "La recomendación propone atender primero este aspecto concreto.",
    });

    const respuesta = await personalizar.fetch(new Request(
      "https://app.example/api/personalizar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solicitudValida),
      },
    ));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      contenido: "La recomendación propone atender primero este aspecto concreto.",
    });
    expect(crearInteraccion).toHaveBeenCalledTimes(1);
    expect(crearInteraccion).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3.5-flash-lite",
      store: false,
    }));
  });

  it("una solicitud puede activar hasta dos intentos de modelo y respeta los topes de entrada", async () => {
    process.env.GEMINI_API_KEY = "gemini_fake_test_key";
    crearInteraccion
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({
        status: "completed",
        output_text: "La recomendación propone atender primero este aspecto concreto.",
      });

    const respuesta = await personalizar.fetch(new Request(
      "https://app.example/api/personalizar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solicitudValida),
      },
    ));

    expect(respuesta.status).toBe(200);
    expect(crearInteraccion).toHaveBeenCalledTimes(2);
    expect(crearInteraccion.mock.calls[0][0]).toMatchObject({
      model: "gemini-3.5-flash-lite",
    });
    expect(crearInteraccion.mock.calls[1][0]).toMatchObject({
      model: "gemini-2.5-flash",
    });

    const respuestaGrande = await personalizar.fetch(new Request(
      "https://app.example/api/personalizar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...solicitudValida,
          resultadoBase: "x".repeat(4001),
        }),
      },
    ));
    expect(respuestaGrande.status).toBe(400);
    expect(crearInteraccion).toHaveBeenCalledTimes(2);
  });
});
