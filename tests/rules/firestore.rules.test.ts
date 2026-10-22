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
    });
  });

  it("solo permite leer la versión publicada actual de una copia; los borradores y leads siguen privados", async () => {
    const versionId = "pub-synthetic-v1";
    const visitante = environment.unauthenticatedContext().firestore();
    const publicacionRef = doc(
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
        publicacion: {
          estado: "publicado",
          versionId,
          publicadoPor: PLATFORM_ADMIN_EMAIL,
          publicadoEn: serverTimestamp(),
        },
      });
      await setDoc(doc(
        context.firestore(),
        `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/${versionId}`,
      ), {
        empresaId: COMPANY_CLEARIA,
        cuestionarioId: PERSONALIZED_QUESTIONNAIRE_ID,
        versionId,
        configuracion: documentoCopia().configuracion,
      });
    });
    await assertSucceeds(getDoc(versionRef));
    await assertFails(getDoc(publicacionRef));
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
      ), { publicacion: { estado: "borrador" } });
    });
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
      publicacion: {
        estado: "publicado",
        versionId: "pub-client-forged",
      },
    }));
    await assertFails(setDoc(doc(
      database,
      `empresas/${COMPANY_CLEARIA}/cuestionarios/${PERSONALIZED_QUESTIONNAIRE_ID}/versiones/pub-client-forged`,
    ), {
      empresaId: COMPANY_CLEARIA,
      cuestionarioId: PERSONALIZED_QUESTIONNAIRE_ID,
      versionId: "pub-client-forged",
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
});
