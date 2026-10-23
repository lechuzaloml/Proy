import { describe, expect, it, vi } from "vitest";
import casoNuevo from "../../spec/Ejemplos/caso-nuevo.json";
import { crearCuestionarioGuardado, listarCuestionariosGuardados } from "./cuestionariosGuardados";

const mocks = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, ...partes: string[]) => partes.join("/")),
  doc: vi.fn((referencia: string, ...partes: string[]) =>
    [referencia, ...partes].join("/"),
  ),
  serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  setDoc: vi.fn(async () => undefined),
  getDocsFromServer: vi.fn(async () => ({ docs: [] })),
}));

vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  getDocsFromServer: mocks.getDocsFromServer,
  deleteDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("./firebase", () => ({ db: {} }));

describe("cuestionarios guardados por empresa", () => {
  it("crea y lista copias usando exclusivamente la empresa recibida", async () => {
    const empresaId = "demo-a";
    const id = "personalizado-demo-a-test";
    await crearCuestionarioGuardado(
      empresaId,
      id,
      "Copia demo-a",
      casoNuevo,
      "admin@example.test",
    );
    await listarCuestionariosGuardados(empresaId);

    expect(mocks.collection).toHaveBeenNthCalledWith(
      1,
      {},
      "empresas",
      empresaId,
      "cuestionarios",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "empresas/demo-a/cuestionarios",
      id,
    );
    expect(mocks.setDoc).toHaveBeenCalledWith(
      "empresas/demo-a/cuestionarios/personalizado-demo-a-test",
      expect.objectContaining({ id, nombre: "Copia demo-a" }),
    );
    expect(mocks.collection.mock.calls.flat().join("/"))
      .not.toContain("empresas/clearia");
  });
});
