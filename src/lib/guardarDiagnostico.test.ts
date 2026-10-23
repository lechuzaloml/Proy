import type { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentosDiagnostico } from "./construirDocumentosDiagnostico";
import { guardarDiagnostico } from "./guardarDiagnostico";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, ...partes: string[]) => partes.join("/")),
  serverTimestamp: vi.fn(() => "server-time"),
  set: vi.fn(),
  commit: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  serverTimestamp: mocks.serverTimestamp,
  writeBatch: () => ({
    set: mocks.set,
    commit: mocks.commit,
  }),
}));

vi.mock("./firebase", () => ({ db: {} }));

const fecha = {} as Timestamp;
const documentos: DocumentosDiagnostico = {
  lead: {
    nombre: "Prospecto",
    correo: "prospecto@example.test",
    telefono: "5550000000",
    consentimiento: { aceptado: true, version: "v1", fecha },
    origen: "formulario-publico",
    estado: "nuevo",
    ultimaActividadEn: fecha,
    ultimoDiagnosticoId: "envio-1",
    creadoEn: fecha,
  },
  diagnostico: {
    leadId: "envio-1",
    cuestionarioId: "personalizado-demo",
    versionId: "version-1",
    respuestas: {},
    completadoEn: fecha,
  },
};

describe("guardarDiagnostico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa la empresa recibida para las dos rutas de escritura", async () => {
    await expect(guardarDiagnostico("demo-a", "envio-1", documentos))
      .resolves.toBe(true);

    expect(mocks.doc).toHaveBeenNthCalledWith(
      1,
      {},
      "empresas",
      "demo-a",
      "leads",
      "envio-1",
    );
    expect(mocks.doc).toHaveBeenNthCalledWith(
      2,
      {},
      "empresas",
      "demo-a",
      "diagnosticos",
      "envio-1",
    );
    expect(mocks.set.mock.calls.map(([referencia]) => referencia)).toEqual([
      "empresas/demo-a/leads/envio-1",
      "empresas/demo-a/diagnosticos/envio-1",
    ]);
    expect(mocks.set.mock.calls.map(([referencia]) => referencia))
      .not.toContain("empresas/clearia/leads/envio-1");
  });
});
