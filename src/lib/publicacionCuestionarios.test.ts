import { afterEach, describe, expect, it, vi } from "vitest";
import { cambiarPublicacionCuestionario } from "./publicacionCuestionarios";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cambiarPublicacionCuestionario", () => {
  it("explica cuando el endpoint responde sin contenido JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );

    await expect(
      cambiarPublicacionCuestionario(
        "despublicar",
        "empresa-a",
        "cuestionario-a",
        "token",
      ),
    ).rejects.toThrow("El servidor devolvió una respuesta vacía (HTTP 404).");
  });
});
