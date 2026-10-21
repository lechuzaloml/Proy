import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import "firebase/compat/firestore";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "@firebase/firestore";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-clear-ia-rules";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;
const MEMBER_EMAIL = "rules-reader@example.invalid";
const SYNTHETIC_LEAD_ID = "synthetic-lead";
const PUBLISHED_QUESTIONNAIRE_ID = "synthetic-published-questionnaire";
const DRAFT_QUESTIONNAIRE_ID = "synthetic-draft-questionnaire";
const COMPANY_CLEARIA = "clearia";
const COMPANY_B = "demo-b";

let environment: RulesTestEnvironment;
type TestFirestore = ReturnType<RulesTestContext["firestore"]>;

function firestoreEmulatorIsConfigured(): void {
  const expectedHost = `${EMULATOR_HOST}:${EMULATOR_PORT}`;
  if (process.env.FIRESTORE_EMULATOR_HOST !== expectedHost) {
    throw new Error(
      `Rules tests require Firestore Emulator at ${expectedHost}; no production fallback is allowed.`,
    );
  }
  if (!PROJECT_ID.startsWith("demo-")) {
    throw new Error("Rules tests must use an isolated demo project ID.");
  }
}

async function seedFixtures(): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();

    await Promise.all([
      setDoc(doc(database, `empresas/${COMPANY_CLEARIA}`), {
        nombre: "Empresa sintética Clear-IA",
        estado: "activa",
        planId: "test",
      }),
      setDoc(doc(database, `empresas/${COMPANY_B}`), {
        nombre: "Empresa sintética B",
        estado: "activa",
        planId: "test",
      }),
      setDoc(doc(database, `empresas/${COMPANY_CLEARIA}/miembros/${MEMBER_EMAIL}`), {
        correo: MEMBER_EMAIL,
        rol: "usuario",
        permisos: {
          verLeads: true,
          gestionarLeads: false,
          editarCuestionarios: false,
        },
        estado: "activo",
      }),
      setDoc(doc(database, `empresas/${COMPANY_B}/miembros/${MEMBER_EMAIL}`), {
        correo: MEMBER_EMAIL,
        rol: "usuario",
        permisos: {
          verLeads: true,
          gestionarLeads: false,
          editarCuestionarios: false,
        },
        estado: "activo",
      }),
      setDoc(doc(
        database,
        `empresas/${COMPANY_CLEARIA}/leads/${SYNTHETIC_LEAD_ID}`,
      ), {
        nombre: "Lead sintético",
        estado: "nuevo",
      }),
      setDoc(doc(database, `empresas/${COMPANY_B}/leads/${SYNTHETIC_LEAD_ID}`), {
        nombre: "Lead sintético B",
        estado: "nuevo",
      }),
      setDoc(doc(
        database,
        `empresas/demo-public/cuestionarios/${PUBLISHED_QUESTIONNAIRE_ID}`,
      ), {
        estado: "publicado",
        versionActualId: "v1",
      }),
      setDoc(doc(
        database,
        `empresas/demo-public/cuestionarios/${PUBLISHED_QUESTIONNAIRE_ID}/versiones/v1`,
      ), { estado: "publicada", numero: 1 }),
      setDoc(doc(database, "empresas/demo-public"), {
        nombre: "Empresa sintética de publicación",
        estado: "activa",
        planId: "test",
      }),
      setDoc(doc(
        database,
        `empresas/demo-public/cuestionarios/${DRAFT_QUESTIONNAIRE_ID}`,
      ), {
        estado: "borrador",
        versionActualId: "v1",
      }),
      setDoc(doc(
        database,
        `empresas/demo-public/cuestionarios/${DRAFT_QUESTIONNAIRE_ID}/versiones/v1`,
      ), { estado: "borrador", numero: 1 }),
    ]);
  });
}

function contextoMiembro(correo = MEMBER_EMAIL) {
  return environment.authenticatedContext(correo, {
    email: correo,
    email_verified: true,
  });
}

function crearDocumentosDePrueba(
  database: TestFirestore,
  questionnaireId: string,
) {
  const id = `synthetic-attempt-${questionnaireId}`;
  const batch = writeBatch(database);
  batch.set(doc(database, `empresas/demo-public/leads/${id}`), {
    nombre: "Persona de prueba sintética",
    correo: "visitor@example.invalid",
    telefono: "5550000000",
    consentimiento: {
      aceptado: true,
      version: "synthetic-v1",
      fecha: serverTimestamp(),
    },
    origen: "prueba-emulador",
    estado: "nuevo",
    ultimaActividadEn: serverTimestamp(),
    ultimoDiagnosticoId: id,
    ultimoPorcentaje: 0,
    ultimoSegmento: "sintetico",
    creadoEn: serverTimestamp(),
  });
  batch.set(doc(database, `empresas/demo-public/diagnosticos/${id}`), {
    leadId: id,
    cuestionarioId: questionnaireId,
    versionId: "v1",
    respuestas: {},
    puntajeTotal: 0,
    puntajeMaximo: 10,
    porcentaje: 0,
    segmento: "sintetico",
    puntajePorDimension: {},
    templateRecomendadoId: "synthetic-template",
    planRecomendadoId: "synthetic-plan",
    completadoEn: serverTimestamp(),
  });
  return batch.commit();
}

beforeAll(async () => {
  firestoreEmulatorIsConfigured();
  const rules = await readFile(resolve(process.cwd(), "firestore.rules"), "utf8");
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
      rules,
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedFixtures();
});

afterEach(async () => {
  await environment.clearFirestore();
});

afterAll(async () => {
  if (environment) {
    await environment.clearFirestore();
    await environment.cleanup();
  }
});

describe("reglas locales de Firestore", () => {
  it("A: permite leer leads a un miembro activo con verLeads", async () => {
    const database = contextoMiembro().firestore();
    const lectura = getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/leads`),
    );

    await assertSucceeds(lectura);
    const resultado = await lectura;
    expect(resultado.docs.map(({ id }) => id)).toContain(SYNTHETIC_LEAD_ID);
  });

  it("B: impide a un miembro de demo-b leer leads de Clear-IA", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/miembros/${MEMBER_EMAIL}`,
      ));
    });

    const database = contextoMiembro().firestore();
    const lectura = getDoc(doc(
      database,
      `empresas/${COMPANY_CLEARIA}/leads/${SYNTHETIC_LEAD_ID}`,
    ));

    await assertFails(lectura);
  });

  it("C: impide leer leads a un miembro con estado inactivo", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(
          context.firestore(),
          `empresas/${COMPANY_CLEARIA}/miembros/${MEMBER_EMAIL}`,
        ),
        { estado: "inactivo" },
      );
    });

    const database = contextoMiembro().firestore();
    const lectura = getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/leads`),
    );

    await assertFails(lectura);
  });

  it("D: rechaza el lote público si el cuestionario no está publicado", async () => {
    const database = environment.unauthenticatedContext().firestore();
    const escritura = crearDocumentosDePrueba(
      database,
      DRAFT_QUESTIONNAIRE_ID,
    );

    await assertFails(escritura);
  });

  it("E: permite crear como visitante el par válido de un cuestionario publicado", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(
      crearDocumentosDePrueba(database, PUBLISHED_QUESTIONNAIRE_ID),
    );

    await environment.withSecurityRulesDisabled(async (context) => {
      const id = `synthetic-attempt-${PUBLISHED_QUESTIONNAIRE_ID}`;
      const adminDatabase = context.firestore();
      const [lead, diagnostico] = await Promise.all([
        getDoc(doc(adminDatabase, `empresas/demo-public/leads/${id}`)),
        getDoc(doc(adminDatabase, `empresas/demo-public/diagnosticos/${id}`)),
      ]);
      expect(lead.exists()).toBe(true);
      expect(diagnostico.exists()).toBe(true);
      expect(lead.id).toBe(diagnostico.id);
    });
  });

  it("F: rechaza cambiar el estado de un lead sin gestionarLeads", async () => {
    const database = contextoMiembro().firestore();
    const escritura = updateDoc(
      doc(
        database,
        `empresas/${COMPANY_CLEARIA}/leads/${SYNTHETIC_LEAD_ID}`,
      ),
      {
        estado: "contactado",
        ultimaActividadEn: serverTimestamp(),
      },
    );

    await assertFails(escritura);
  });

  it("G: rechaza crear un seguimiento sin gestionarLeads", async () => {
    const database = contextoMiembro().firestore();
    const escritura = setDoc(
      doc(
        database,
        `empresas/${COMPANY_CLEARIA}/leads/${SYNTHETIC_LEAD_ID}/seguimientos/synthetic-follow-up`,
      ),
      {
        tipo: "nota",
        notas: "Seguimiento sintético de prueba.",
        creadoPor: MEMBER_EMAIL,
        creadoEn: serverTimestamp(),
      },
    );

    await assertFails(escritura);
  });
});
