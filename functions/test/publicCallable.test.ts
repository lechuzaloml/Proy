import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = "demo-clear-ia-rules";
const FUNCTIONS_URL =
  "http://127.0.0.1:5001/demo-clear-ia-rules/us-central1";
let database: ReturnType<typeof getFirestore>;
let app: ReturnType<typeof initializeApp>;

function config(id: string, usaScoring = false) {
  return {
    id,
    cliente: "Cuestionario sintético",
    estado: "borrador",
    posicion_contacto: "inicio",
    preguntas: [{
      id: "pregunta-1",
      texto: "Pregunta sintética",
      tipo: "opcion_multiple",
      opciones: [{ texto: "Opción A", ...(usaScoring ? { puntos: 2 } : {}) }],
      participa_scoring: usaScoring,
    }],
    usa_scoring: usaScoring,
    ...(usaScoring
      ? {
          reglas_scoring: [{ puntaje_min: 0, puntaje_max: 2, segmento: "apto" }],
          resultado: {
            tipo: "por_segmento",
            resultados: [{ segmento: "apto", contenido: "Resultado calculado." }],
          },
        }
      : { resultado: { tipo: "fijo", contenido: "Resultado fijo." } }),
  };
}

async function publicarCopiaEnEmulador(
  empresaId: string,
  usaScoring = false,
) {
  const cuestionarioId = `personalizado-${randomUUID()}`;
  const versionId = `pub-${randomUUID()}`;
  const cuestionarioRef = database.doc(
    `empresas/${empresaId}/cuestionarios/${cuestionarioId}`,
  );
  const configuracion = config(cuestionarioId, usaScoring);
  await database.doc(`empresas/${empresaId}`).set({
    nombre: "Empresa sintética",
    estado: "activa",
  });
  await cuestionarioRef.set({
    id: cuestionarioId,
    nombre: "Copia sintética",
    estado: "borrador",
    configuracion,
    publicacion: { estado: "publicado", versionId },
  });
  await cuestionarioRef.collection("versiones").doc(versionId).set({
    empresaId,
    cuestionarioId,
    versionId,
    configuracion,
  });
  return { empresaId, cuestionarioId, versionId };
}

function solicitud(
  publicacion: { empresaId: string; cuestionarioId: string; versionId: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    ...publicacion,
    submissionId: randomUUID(),
    contacto: {
      nombre: "Persona sintética",
      correo: "persona@example.invalid",
      telefono: "5550000000",
    },
    respuestas: { 0: { tipo: "opcion_multiple", indiceOpcion: 0 } },
    consentimientoAceptado: true,
    ...overrides,
  };
}

async function llamarFuncion(nombre: string, data: unknown, idToken?: string) {
  return fetch(`${FUNCTIONS_URL}/${nombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
}

async function crearCuentaVerificada(email: string): Promise<string> {
  const password = `Test-${randomUUID()}-Aa1!`;
  const registro = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!registro.ok) {
    throw new Error("No se pudo crear la cuenta sintética en el emulador.");
  }
  const datosRegistro = await registro.json() as { localId: string };
  await getAuth(app).updateUser(datosRegistro.localId, { emailVerified: true });
  const inicio = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!inicio.ok) {
    throw new Error("No se pudo iniciar sesión con la cuenta sintética.");
  }
  const datosInicio = await inicio.json() as { idToken: string };
  return datosInicio.idToken;
}

beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
    throw new Error("Callable tests require the local Firestore Emulator.");
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
    throw new Error("Callable authorization tests require the local Auth Emulator.");
  }
  app = initializeApp({ projectId: PROJECT_ID }, `callable-test-${randomUUID()}`);
  database = getFirestore(app);
});

afterAll(async () => {
  if (app) {
    await deleteApp(app);
  }
});

describe("Cloud Function de envíos públicos", () => {
  it("guarda como anónimo una copia sin scoring y mantiene los reintentos idempotentes", async () => {
    const publicacion = await publicarCopiaEnEmulador("clearia");
    const envio = solicitud(publicacion);
    const primeraRespuesta = await llamarFuncion("enviarCopiaPublicada", envio);
    expect(primeraRespuesta.ok).toBe(true);
    const reintento = await llamarFuncion("enviarCopiaPublicada", envio);
    expect(reintento.ok).toBe(true);

    const [lead, diagnostico] = await Promise.all([
      database.doc(`empresas/clearia/leads/${envio.submissionId}`).get(),
      database.doc(`empresas/clearia/diagnosticos/${envio.submissionId}`).get(),
    ]);
    expect(lead.exists).toBe(true);
    expect(diagnostico.data()?.versionId).toBe(publicacion.versionId);
    expect(diagnostico.data()?.resultado.tipo).toBe("fijo");
    expect(diagnostico.data()).not.toHaveProperty("puntajeTotal");
    expect(diagnostico.data()).not.toHaveProperty("segmento");
  });

  it("recalcula y persiste score/segmento solo cuando el scoring está activo", async () => {
    const publicacion = await publicarCopiaEnEmulador("clearia", true);
    const envio = solicitud(publicacion);
    const respuesta = await llamarFuncion("enviarCopiaPublicada", envio);
    expect(respuesta.ok).toBe(true);
    const diagnostico = await database.doc(
      `empresas/clearia/diagnosticos/${envio.submissionId}`,
    ).get();
    expect(diagnostico.data()?.puntajeTotal).toBe(2);
    expect(diagnostico.data()?.segmento).toBe("apto");
  });

  it("rechaza falta de consentimiento, payload inválido, borradores y otra empresa", async () => {
    const publicacion = await publicarCopiaEnEmulador("clearia");
    const sinConsentimiento = await llamarFuncion(
      "enviarCopiaPublicada",
      solicitud(publicacion, { consentimientoAceptado: false }),
    );
    expect(sinConsentimiento.ok).toBe(false);

    const payloadInvalido = await llamarFuncion(
      "enviarCopiaPublicada",
      solicitud(publicacion, {
        respuestas: { 0: { tipo: "opcion_multiple", indiceOpcion: 9 } },
      }),
    );
    expect(payloadInvalido.ok).toBe(false);

    const borrador = await llamarFuncion(
      "enviarCopiaPublicada",
      solicitud({ ...publicacion, versionId: "pub-no-publicada" }),
    );
    expect(borrador.ok).toBe(false);

    const empresaAjena = await llamarFuncion(
      "enviarCopiaPublicada",
      solicitud({ ...publicacion, empresaId: "empresa-ajena" }),
    );
    expect(empresaAjena.ok).toBe(false);
  });

  it("exige sesión verificada para publicar o despublicar", async () => {
    const respuesta = await llamarFuncion("gestionarPublicacionCopia", {
      empresaId: "clearia",
      cuestionarioId: "personalizado-ficticio",
      accion: "despublicar",
    });
    expect(respuesta.ok).toBe(false);
  });

  it("publica y despublica versiones solo con permiso de edición de la empresa", async () => {
    const email = `editor-${randomUUID()}@example.invalid`;
    const idToken = await crearCuentaVerificada(email);
    const publicacion = await publicarCopiaEnEmulador("clearia");
    await database.doc(`empresas/clearia/miembros/${email}`).set({
      correo: email,
      rol: "usuario",
      estado: "activo",
      permisos: { editarCuestionarios: true },
    });
    const publicar = await llamarFuncion(
      "gestionarPublicacionCopia",
      {
        empresaId: "clearia",
        cuestionarioId: publicacion.cuestionarioId,
        accion: "publicar",
      },
      idToken,
    );
    expect(publicar.ok).toBe(true);
    const datosPublicar = await publicar.json() as {
      result: { estado: string; versionId: string };
    };
    expect(datosPublicar.result.estado).toBe("publicado");
    const referenciaCopia = database.doc(
      `empresas/clearia/cuestionarios/${publicacion.cuestionarioId}`,
    );
    const version = await referenciaCopia
      .collection("versiones")
      .doc(datosPublicar.result.versionId)
      .get();
    expect(version.data()?.versionId).toBe(datosPublicar.result.versionId);

    const despublicar = await llamarFuncion(
      "gestionarPublicacionCopia",
      {
        empresaId: "clearia",
        cuestionarioId: publicacion.cuestionarioId,
        accion: "despublicar",
      },
      idToken,
    );
    expect(despublicar.ok).toBe(true);
    expect((await referenciaCopia.get()).data()?.publicacion.estado).toBe("borrador");
  });
});
