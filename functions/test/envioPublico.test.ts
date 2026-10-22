import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { crearDocumentosEnvioAtomico } from "../src/registroEnvio";

const PROJECT_ID = "demo-clear-ia-rules";
let database: ReturnType<typeof getFirestore>;
let app: ReturnType<typeof initializeApp>;

beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
    throw new Error("Backend tests require the local Firestore Emulator.");
  }
  app = initializeApp({ projectId: PROJECT_ID }, `functions-test-${randomUUID()}`);
  database = getFirestore(app);
});

afterAll(async () => {
  if (app) {
    await deleteApp(app);
  }
});

describe("persistencia atómica del endpoint público", () => {
  it("crea el par lead/diagnóstico una sola vez y no deja escrituras parciales ante duplicados", async () => {
    const id = randomUUID();
    const leadRef = database.doc(`empresas/clearia/leads/${id}`);
    const diagnosticoRef = database.doc(`empresas/clearia/diagnosticos/${id}`);
    const lead = { nombre: "Persona sintética", consentimiento: { aceptado: true } };
    const diagnostico = { leadId: id, respuestas: {}, resultado: { tipo: "fijo" } };

    await database.runTransaction(async (transaction) => {
      crearDocumentosEnvioAtomico(
        transaction,
        leadRef,
        diagnosticoRef,
        lead,
        diagnostico,
      );
    });
    await expect(database.runTransaction(async (transaction) => {
      crearDocumentosEnvioAtomico(
        transaction,
        leadRef,
        diagnosticoRef,
        { ...lead, nombre: "Cambio no autorizado" },
        diagnostico,
      );
    })).rejects.toThrow();

    const [leadGuardado, diagnosticoGuardado] = await Promise.all([
      leadRef.get(),
      diagnosticoRef.get(),
    ]);
    expect(leadGuardado.data()?.nombre).toBe(lead.nombre);
    expect(diagnosticoGuardado.data()?.leadId).toBe(id);

    const idConLeadPrevio = randomUUID();
    const leadPrevioRef = database.doc(`empresas/clearia/leads/${idConLeadPrevio}`);
    const diagnosticoParcialRef = database.doc(
      `empresas/clearia/diagnosticos/${idConLeadPrevio}`,
    );
    await leadPrevioRef.create(lead);
    await expect(database.runTransaction(async (transaction) => {
      crearDocumentosEnvioAtomico(
        transaction,
        leadPrevioRef,
        diagnosticoParcialRef,
        lead,
        { ...diagnostico, leadId: idConLeadPrevio },
      );
    })).rejects.toThrow();
    expect((await diagnosticoParcialRef.get()).exists).toBe(false);

    await Promise.all([
      leadRef.delete(),
      diagnosticoRef.delete(),
      leadPrevioRef.delete(),
    ]);
  });
});
