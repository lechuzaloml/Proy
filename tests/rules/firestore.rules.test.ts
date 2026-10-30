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
const PLATFORM_ADMIN_EMAIL = "rules-platform-admin@example.invalid";
const SYNTHETIC_LEAD_ID = "synthetic-lead";
const PUBLISHED_QUESTIONNAIRE_ID = "synthetic-published-questionnaire";
const DRAFT_QUESTIONNAIRE_ID = "synthetic-draft-questionnaire";
const PERSONALIZED_QUESTIONNAIRE_ID = "personalizado-emulator-copy";
const COMPANY_CLEARIA = "clearia";
const COMPANY_B = "demo-b";
const COMPANY_DEMO_A = "demo-a";
const COMPANY_MEMBER_ROLES = "demo-member-roles";
const DEMO_A_MEMBER_EMAIL = "demo-a-only@example.invalid";
const OWNER_EMAIL = "owner@example.invalid";
const OTHER_OWNER_EMAIL = "other-owner@example.invalid";
const ADMIN_EMAIL = "company-admin@example.invalid";
const OTHER_ADMIN_EMAIL = "other-admin@example.invalid";
const USER_EMAIL = "company-user@example.invalid";
const OTHER_USER_EMAIL = "other-user@example.invalid";

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

function crearDocumentosDeCopia(
  database: TestFirestore,
  id: string,
  usaScoring = false,
  consentimiento = true,
) {
  const batch = writeBatch(database);
  const lead: Record<string, unknown> = {
    nombre: "Persona sintética",
    correo: "visitor@example.invalid",
    telefono: "5550000000",
    consentimiento: {
      aceptado: consentimiento,
      version: "synthetic-v1",
      fecha: serverTimestamp(),
    },
    origen: "copia-clear-ia",
    estado: "nuevo",
    ultimaActividadEn: serverTimestamp(),
    ultimoDiagnosticoId: id,
    creadoEn: serverTimestamp(),
  };
  const diagnostico: Record<string, unknown> = {
    leadId: id,
    cuestionarioId: PERSONALIZED_QUESTIONNAIRE_ID,
    respuestas: {},
    resultado: usaScoring
      ? {
          tipo: "por_segmento",
          resultados: [{
            segmento: "sintetico",
            contenido: "Resultado sintético",
          }],
        }
      : { tipo: "fijo", contenido: "Resultado sintético" },
    completadoEn: serverTimestamp(),
  };
  if (usaScoring) {
    lead.ultimoPorcentaje = 100;
    lead.ultimoSegmento = "sintetico";
    diagnostico.puntajeTotal = 1;
    diagnostico.puntajeMaximo = 1;
    diagnostico.porcentaje = 100;
    diagnostico.segmento = "sintetico";
  }
  batch.set(doc(database, `empresas/${COMPANY_CLEARIA}/leads/${id}`), lead);
  batch.set(
    doc(database, `empresas/${COMPANY_CLEARIA}/diagnosticos/${id}`),
    diagnostico,
  );
  return batch.commit();
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
      setDoc(
        doc(
          database,
          `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
        ),
        documentoCopia(),
      ),
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
      setDoc(doc(
        database,
        `plataformaAdmins/${PLATFORM_ADMIN_EMAIL}`,
      ), { correo: PLATFORM_ADMIN_EMAIL }),
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

function documentoMiembro(correo: string, rol: string) {
  return {
    correo,
    rol,
    estado: "activo",
    permisos: {},
  };
}

async function prepararMiembrosDePrueba(): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, `empresas/${COMPANY_MEMBER_ROLES}`), {
      nombre: "Empresa sintética para roles",
      estado: "activa",
      planId: "test",
    });
    await Promise.all([
      [OWNER_EMAIL, "propietario"],
      [OTHER_OWNER_EMAIL, "propietario"],
      [ADMIN_EMAIL, "admin"],
      [OTHER_ADMIN_EMAIL, "admin"],
      [USER_EMAIL, "usuario"],
      [OTHER_USER_EMAIL, "usuario"],
    ].map(([correo, rol]) =>
      setDoc(
        doc(database, `empresas/${COMPANY_MEMBER_ROLES}/miembros/${correo}`),
        documentoMiembro(correo, rol),
      )
    ));
  });
}

function contextoMiembro(correo = MEMBER_EMAIL) {
  return environment.authenticatedContext(correo, {
    email: correo,
    email_verified: true,
  });
}

function documentoCopia(nombre = "Copia sintética", usaScoring = false) {
  return {
    id: PERSONALIZED_QUESTIONNAIRE_ID,
    nombre,
    estado: "borrador",
    configuracion: {
      id: PERSONALIZED_QUESTIONNAIRE_ID,
      cliente: nombre,
      estado: "borrador",
      posicion_contacto: "inicio",
      preguntas: [{
        id: "pregunta-sintetica",
        texto: "Pregunta sintética",
        tipo: "opcion_multiple",
        opciones: [{ texto: "Opción sintética", puntos: 1 }],
        participa_scoring: usaScoring,
      }],
      usa_scoring: usaScoring,
      ...(usaScoring
        ? {
            reglas_scoring: [{
              puntaje_min: 0,
              puntaje_max: 1,
              segmento: "sintetico",
            }],
            resultado: {
              tipo: "por_segmento",
              resultados: [{
                segmento: "sintetico",
                contenido: "Resultado sintético",
              }],
            },
          }
        : {
            resultado: {
              tipo: "fijo",
              contenido: "Resultado sintético",
            },
          }),
    },
    creadoPor: MEMBER_EMAIL,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  };
}

async function establecerPermisoEdicion(correo: string, habilitado: boolean) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(
      doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/miembros/${correo}`,
      ),
      { "permisos.editarCuestionarios": habilitado },
    );
  });
}

function assertPermissionDenied(operacion: Promise<unknown>) {
  return expect(operacion).rejects.toMatchObject({ code: "permission-denied" });
}

function crearDocumentosDePrueba(
  database: TestFirestore,
  questionnaireId: string,
  usaScoring = false,
) {
  const id = `synthetic-attempt-${questionnaireId}`;
  const batch = writeBatch(database);
  const lead: Record<string, unknown> = {
    nombre: "Persona de prueba sintética",
    correo: "visitor@example.invalid",
    telefono: "5550000000",
    consentimiento: {
      aceptado: true,
      version: "synthetic-v1",
      fecha: serverTimestamp(),
    },
    origen: "formulario-publico",
    estado: "nuevo",
    ultimaActividadEn: serverTimestamp(),
    ultimoDiagnosticoId: id,
    creadoEn: serverTimestamp(),
  };
  const diagnostico: Record<string, unknown> = {
    leadId: id,
    cuestionarioId: questionnaireId,
    versionId: "v1",
    respuestas: {},
    resultado: usaScoring
      ? {
          tipo: "por_segmento",
          resultados: [{
            segmento: "sintetico",
            contenido: "Resultado sintético",
          }],
        }
      : { tipo: "fijo", contenido: "Resultado sintético" },
    completadoEn: serverTimestamp(),
  };
  if (usaScoring) {
    lead.ultimoPorcentaje = 0;
    lead.ultimoSegmento = "sintetico";
    diagnostico.puntajeTotal = 0;
    diagnostico.puntajeMaximo = 10;
    diagnostico.porcentaje = 0;
    diagnostico.segmento = "sintetico";
    diagnostico.puntajePorDimension = {};
  }
  batch.set(doc(database, `empresas/demo-public/leads/${id}`), lead);
  batch.set(doc(database, `empresas/demo-public/diagnosticos/${id}`), diagnostico);
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

it("permite a una cuenta autorizada guardar el envío atómico de una copia sin scoring", async () => {
  await establecerPermisoEdicion(MEMBER_EMAIL, true);
  const database = contextoMiembro().firestore();
  await assertSucceeds(crearDocumentosDeCopia(
    database,
    "synthetic-copy-no-score",
  ));

  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(
      context.firestore(),
      `empresas/${COMPANY_CLEARIA}/diagnosticos/synthetic-copy-no-score`,
    ));
    expect(snapshot.data()).not.toHaveProperty("puntajeTotal");
    expect(snapshot.data()).not.toHaveProperty("segmento");
    expect(snapshot.data()?.resultado.tipo).toBe("fijo");
  });
});

it("permite a un miembro solo de demo-a copiar, publicar y recibir un envío en demo-a", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, `empresas/${COMPANY_DEMO_A}`), {
        nombre: "Empresa sintética demo-a",
        estado: "activa",
        planId: "test",
      });
      await setDoc(
        doc(database, `empresas/${COMPANY_DEMO_A}/miembros/${DEMO_A_MEMBER_EMAIL}`),
        {
          correo: DEMO_A_MEMBER_EMAIL,
          rol: "admin",
          permisos: {},
          estado: "activo",
        },
      );
    });

    const member = environment.authenticatedContext(DEMO_A_MEMBER_EMAIL, {
      email: DEMO_A_MEMBER_EMAIL,
      email_verified: true,
    }).firestore();
    const questionnaireRef = doc(
      member,
      `empresas/${COMPANY_DEMO_A}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );
    await assertSucceeds(setDoc(questionnaireRef, documentoCopia()));
    const versionId = "demo-a-published-v1";
    const publish = writeBatch(member);
    publish.set(doc(
      member,
      `empresas/${COMPANY_DEMO_A}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
    ), {
      numero: 1,
      configuracion: documentoCopia().configuracion,
      publicadaEn: serverTimestamp(),
      creadoPor: DEMO_A_MEMBER_EMAIL,
    });
    publish.update(questionnaireRef, {
      estado: "publicado",
      versionActualId: versionId,
      actualizadoEn: serverTimestamp(),
    });
    await assertSucceeds(publish.commit());
    await assertSucceeds(getDocs(collection(
      member,
      `empresas/${COMPANY_DEMO_A}/cuestionarios`,
    )));

    const submissionId = "synthetic-demo-a-public-submission";
    const visitor = environment.unauthenticatedContext().firestore();
    const submission = writeBatch(visitor);
    submission.set(doc(
      visitor,
      `empresas/${COMPANY_DEMO_A}/leads/${submissionId}`,
    ), {
      nombre: "Prospecto sintético",
      correo: "prospecto@example.invalid",
      telefono: "5550000000",
      consentimiento: {
        aceptado: true,
        version: "synthetic-v1",
        fecha: serverTimestamp(),
      },
      origen: "formulario-publico",
      estado: "nuevo",
      ultimaActividadEn: serverTimestamp(),
      ultimoDiagnosticoId: submissionId,
      creadoEn: serverTimestamp(),
    });
    submission.set(doc(
      visitor,
      `empresas/${COMPANY_DEMO_A}/diagnosticos/${submissionId}`,
    ), {
      leadId: submissionId,
      cuestionarioId: PERSONALIZED_QUESTIONNAIRE_ID,
      versionId,
      respuestas: {},
      completadoEn: serverTimestamp(),
    });
    await assertSucceeds(submission.commit());
    await assertSucceeds(updateDoc(questionnaireRef, {
      estado: "borrador",
      actualizadoEn: serverTimestamp(),
    }));
    await assertSucceeds(getDocs(collection(
      member,
      `empresas/${COMPANY_DEMO_A}/leads`,
    )));
    await assertFails(getDocs(collection(
      member,
      `empresas/${COMPANY_CLEARIA}/leads`,
    )));

    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      const [
        leadDemoA,
        diagnosticoDemoA,
        cuestionarioDemoA,
        leadClearIa,
        diagnosticoClearIa,
        cuestionarioClearIa,
      ] =
        await Promise.all([
          getDoc(doc(database, `empresas/${COMPANY_DEMO_A}/leads/${submissionId}`)),
          getDoc(doc(database, `empresas/${COMPANY_DEMO_A}/diagnosticos/${submissionId}`)),
          getDoc(doc(database, `empresas/${COMPANY_DEMO_A}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`)),
          getDoc(doc(database, `empresas/${COMPANY_CLEARIA}/leads/${submissionId}`)),
          getDoc(doc(database, `empresas/${COMPANY_CLEARIA}/diagnosticos/${submissionId}`)),
          getDoc(doc(database, `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`)),
        ]);
      expect(leadDemoA.exists()).toBe(true);
      expect(diagnosticoDemoA.data()?.cuestionarioId)
        .toBe(PERSONALIZED_QUESTIONNAIRE_ID);
      expect(leadClearIa.exists()).toBe(false);
      expect(diagnosticoClearIa.exists()).toBe(false);
      expect(cuestionarioDemoA.data()?.estado).toBe("borrador");
      expect(cuestionarioClearIa.data()?.estado).toBe("borrador");
      expect(cuestionarioClearIa.data()).not.toHaveProperty("versionActualId");
  });
});

it("permite guardar puntaje y segmento de una copia con scoring", async () => {
  await establecerPermisoEdicion(MEMBER_EMAIL, true);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      ),
      documentoCopia("Copia con scoring", true),
    );
  });
  const database = contextoMiembro().firestore();
  await assertSucceeds(crearDocumentosDeCopia(
    database,
    "synthetic-copy-score",
    true,
  ));
});

it("rechaza copias sin consentimiento, sin permiso o autorizadas en otra empresa", async () => {
  const database = contextoMiembro().firestore();
  await assertFails(crearDocumentosDeCopia(
    environment.unauthenticatedContext().firestore(),
    "synthetic-copy-unauthenticated",
  ));
  await assertFails(crearDocumentosDeCopia(
    database,
    "synthetic-copy-no-consent",
    false,
    false,
  ));
  await assertFails(crearDocumentosDeCopia(
    database,
    "synthetic-copy-no-permission",
  ));

  await establecerPermisoEdicion(MEMBER_EMAIL, false);
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(
      doc(
        context.firestore(),
        `empresas/${COMPANY_B}/miembros/${MEMBER_EMAIL}`,
      ),
      { "permisos.editarCuestionarios": true },
    );
    await setDoc(
      doc(
        context.firestore(),
        `empresas/${COMPANY_B}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      ),
      documentoCopia(),
    );
  });
  await assertFails(crearDocumentosDeCopia(
    contextoMiembro().firestore(),
    "synthetic-copy-cross-company",
  ));
});

it("rechaza duplicar el mismo envío de copia", async () => {
  await establecerPermisoEdicion(MEMBER_EMAIL, true);
  const database = contextoMiembro().firestore();
  await assertSucceeds(crearDocumentosDeCopia(
    database,
    "synthetic-copy-duplicate",
  ));
  await assertFails(crearDocumentosDeCopia(
    database,
    "synthetic-copy-duplicate",
  ));
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
      expect(lead.data()?.origen).toBe("formulario-publico");
      expect(Object.keys(lead.data() ?? {}).sort()).toEqual([
        "nombre",
        "correo",
        "telefono",
        "consentimiento",
        "origen",
        "estado",
        "ultimaActividadEn",
        "ultimoDiagnosticoId",
        "creadoEn",
      ].sort());
      expect(diagnostico.data()?.versionId).toBe("v1");
      expect(diagnostico.data()?.resultado).toEqual({
        tipo: "fijo",
        contenido: "Resultado sintético",
      });
      expect(diagnostico.data()).not.toHaveProperty("puntajeTotal");
      expect(diagnostico.data()).not.toHaveProperty("segmento");
      expect((await getDoc(doc(
        adminDatabase,
        `empresas/demo-b/leads/${id}`,
      ))).exists()).toBe(false);
    });
  });

  it("permite un lote público con los campos opcionales de scoring autorizados", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(crearDocumentosDePrueba(
      database,
      PUBLISHED_QUESTIONNAIRE_ID,
      true,
    ));

    await environment.withSecurityRulesDisabled(async (context) => {
      const diagnostico = await getDoc(doc(
        context.firestore(),
        `empresas/demo-public/diagnosticos/synthetic-attempt-${PUBLISHED_QUESTIONNAIRE_ID}`,
      ));
      expect(diagnostico.data()).toMatchObject({
        puntajeTotal: 0,
        puntajeMaximo: 10,
        porcentaje: 0,
        segmento: "sintetico",
      });
    });
  });

  it("solo permite leer la versión publicada actual de una copia; los borradores y leads siguen privados", async () => {
    const versionId = "pub-synthetic-v1";
    const visitante = environment.unauthenticatedContext().firestore();
    const cuestionarioRef = doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );
    const versionRef = doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
    );
    await environment.withSecurityRulesDisabled(async (context) => {
      const base = doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      );
      await updateDoc(base, {
        estado: "publicado",
        versionActualId: versionId,
      });
      await setDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
      ), {
        numero: 1,
        configuracion: documentoCopia().configuracion,
        publicadaEn: serverTimestamp(),
        creadoPor: PLATFORM_ADMIN_EMAIL,
      });
    });
    await assertSucceeds(getDoc(versionRef));
    await assertSucceeds(getDoc(cuestionarioRef));
    await assertFails(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/borrador`,
    )));
    await assertFails(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/leads/${SYNTHETIC_LEAD_ID}`,
    )));
    await assertFails(setDoc(versionRef, { versionId }));

    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      ), { estado: "borrador" });
    });
    await assertFails(getDoc(cuestionarioRef));
    await assertFails(getDoc(versionRef));
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

  it("permite a un miembro con editarCuestionarios en clearia crear, listar, leer y actualizar copias", async () => {
    await establecerPermisoEdicion(MEMBER_EMAIL, true);
    await environment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      ));
    });
    const database = contextoMiembro().firestore();
    const referencia = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );

    await assertSucceeds(setDoc(referencia, documentoCopia()));
    await assertFails(updateDoc(referencia, {
      estado: "publicado",
    }));
    await assertFails(setDoc(doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/pub-client-forged`,
    ), {
      numero: 1,
      configuracion: documentoCopia().configuracion,
    }));

    const lista = await getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/cuestionarios`),
    );
    expect(lista.docs.map(({ id }) => id)).toContain(
      PERSONALIZED_QUESTIONNAIRE_ID,
    );

    const lectura = await getDoc(referencia);
    expect(lectura.exists()).toBe(true);
    expect(lectura.data()?.configuracion.preguntas).toHaveLength(1);

    await assertSucceeds(updateDoc(referencia, {
      nombre: "Copia sintética actualizada",
      actualizadoEn: serverTimestamp(),
    }));
    expect((await getDoc(referencia)).data()?.nombre).toBe(
      "Copia sintética actualizada",
    );
  });

  it("permite publicar y despublicar con lotes atómicos desde el cliente", async () => {
    await establecerPermisoEdicion(MEMBER_EMAIL, true);
    const database = contextoMiembro().firestore();
    const cuestionarioRef = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );
    const versionId = "client-published-v1";
    const versionRef = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
    );
    const publicar = writeBatch(database);
    publicar.set(versionRef, {
      numero: 1,
      configuracion: documentoCopia().configuracion,
      publicadaEn: serverTimestamp(),
      creadoPor: MEMBER_EMAIL,
    });
    publicar.update(cuestionarioRef, {
      estado: "publicado",
      versionActualId: versionId,
      actualizadoEn: serverTimestamp(),
    });
    await assertSucceeds(publicar.commit());

    const visitante = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    )));
    await assertSucceeds(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
    )));

    await assertSucceeds(updateDoc(cuestionarioRef, {
      estado: "borrador",
      actualizadoEn: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    )));
    await assertFails(getDoc(doc(
      visitante,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
    )));
  });

  it("deniega crear, listar, leer y actualizar en clearia si el permiso solo existe en otra empresa", async () => {
    await establecerPermisoEdicion(MEMBER_EMAIL, false);
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(
          context.firestore(),
          `empresas/${COMPANY_B}/miembros/${MEMBER_EMAIL}`,
        ),
        { "permisos.editarCuestionarios": true },
      );
      await setDoc(
        doc(
          context.firestore(),
          `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
        ),
        documentoCopia(),
      );
    });

    const database = contextoMiembro().firestore();
    const referencia = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );

    await assertPermissionDenied(setDoc(referencia, documentoCopia()));
    await assertPermissionDenied(getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/cuestionarios`),
    ));
    await assertPermissionDenied(getDoc(referencia));
    await assertPermissionDenied(updateDoc(referencia, {
      nombre: "No autorizado",
    }));
  });

  it("deniega crear, listar, leer y actualizar a un miembro sin permiso de edición", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
        ),
        documentoCopia(),
      );
    });

    const database = contextoMiembro().firestore();
    const referencia = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );

    await assertPermissionDenied(setDoc(referencia, documentoCopia()));
    await assertPermissionDenied(getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/cuestionarios`),
    ));
    await assertPermissionDenied(getDoc(referencia));
    await assertPermissionDenied(updateDoc(referencia, {
      nombre: "No autorizado",
    }));
  });

  it("permite a un administrador de plataforma crear, listar, leer y actualizar sin membresía", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
      ));
    });
    const database = contextoMiembro(PLATFORM_ADMIN_EMAIL).firestore();
    const referencia = doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}`,
    );

    await assertSucceeds(setDoc(referencia, documentoCopia()));
    await assertSucceeds(getDocs(
      collection(database, `empresas/${COMPANY_CLEARIA}/cuestionarios`),
    ));
    expect((await getDoc(referencia)).exists()).toBe(true);
    await assertSucceeds(updateDoc(referencia, {
      nombre: "Copia de plataforma actualizada",
      actualizadoEn: serverTimestamp(),
    }));
    expect((await getDoc(referencia)).data()?.nombre).toBe(
      "Copia de plataforma actualizada",
    );
  });

  it("un admin no puede editar ni borrar a un propietario ni a otro admin", async () => {
    await prepararMiembrosDePrueba();
    const database = contextoMiembro(ADMIN_EMAIL).firestore();
    const propietario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OWNER_EMAIL}`,
    );
    const otroAdmin = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_ADMIN_EMAIL}`,
    );

    await assertPermissionDenied(updateDoc(propietario, {
      estado: "inactivo",
    }));
    await assertPermissionDenied(deleteDoc(propietario));
    await assertPermissionDenied(updateDoc(otroAdmin, {
      estado: "inactivo",
    }));
    await assertPermissionDenied(deleteDoc(otroAdmin));
  });

  it("un admin sí gestiona usuarios, pero no puede crear un propietario", async () => {
    await prepararMiembrosDePrueba();
    const database = contextoMiembro(ADMIN_EMAIL).firestore();
    const usuario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${USER_EMAIL}`,
    );

    await assertSucceeds(updateDoc(usuario, { estado: "inactivo" }));
    await assertSucceeds(deleteDoc(usuario));
    await assertSucceeds(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-user@example.invalid`,
      ),
      documentoMiembro("new-user@example.invalid", "usuario"),
    ));
    await assertPermissionDenied(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-owner@example.invalid`,
      ),
      documentoMiembro("new-owner@example.invalid", "propietario"),
    ));
  });

  it("el propietario gestiona admins y usuarios, pero no a otro propietario ni a sí mismo", async () => {
    await prepararMiembrosDePrueba();
    const database = contextoMiembro(OWNER_EMAIL).firestore();
    const admin = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${ADMIN_EMAIL}`,
    );
    const otroAdmin = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_ADMIN_EMAIL}`,
    );
    const otroUsuario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_USER_EMAIL}`,
    );
    const otroPropietario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_OWNER_EMAIL}`,
    );
    const propietario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OWNER_EMAIL}`,
    );

    await assertSucceeds(updateDoc(admin, { estado: "inactivo" }));
    await assertSucceeds(deleteDoc(otroAdmin));
    await assertSucceeds(updateDoc(otroUsuario, { estado: "inactivo" }));
    await assertSucceeds(deleteDoc(otroUsuario));
    await assertSucceeds(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-admin@example.invalid`,
      ),
      documentoMiembro("new-admin@example.invalid", "admin"),
    ));
    await assertSucceeds(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-user@example.invalid`,
      ),
      documentoMiembro("new-user@example.invalid", "usuario"),
    ));
    await assertPermissionDenied(updateDoc(otroPropietario, {
      estado: "inactivo",
    }));
    await assertPermissionDenied(deleteDoc(otroPropietario));
    await assertPermissionDenied(updateDoc(propietario, { rol: "admin" }));
    await assertPermissionDenied(deleteDoc(propietario));
    await assertPermissionDenied(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-owner@example.invalid`,
      ),
      documentoMiembro("new-owner@example.invalid", "propietario"),
    ));
  });

  it("un usuario sin rol de administrador no puede crear, editar ni borrar miembros", async () => {
    await prepararMiembrosDePrueba();
    const database = contextoMiembro(USER_EMAIL).firestore();

    await assertPermissionDenied(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/new-user@example.invalid`,
      ),
      documentoMiembro("new-user@example.invalid", "usuario"),
    ));
    await assertPermissionDenied(updateDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_USER_EMAIL}`,
      ),
      { estado: "inactivo" },
    ));
    await assertPermissionDenied(deleteDoc(doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_USER_EMAIL}`,
    )));
  });

  it("plataforma puede crear, cambiar y quitar propietarios", async () => {
    await prepararMiembrosDePrueba();
    const database = contextoMiembro(PLATFORM_ADMIN_EMAIL).firestore();
    const propietario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OWNER_EMAIL}`,
    );
    const otroPropietario = doc(
      database,
      `empresas/${COMPANY_MEMBER_ROLES}/miembros/${OTHER_OWNER_EMAIL}`,
    );

    await assertSucceeds(setDoc(
      doc(
        database,
        `empresas/${COMPANY_MEMBER_ROLES}/miembros/platform-owner@example.invalid`,
      ),
      documentoMiembro("platform-owner@example.invalid", "propietario"),
    ));
    await assertSucceeds(updateDoc(propietario, { rol: "usuario" }));
    await assertSucceeds(deleteDoc(otroPropietario));
  });
});
