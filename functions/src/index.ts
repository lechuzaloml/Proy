import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { construirDocumentosCopia } from "../../src/lib/construirDocumentosDiagnostico";
import { calcularResultado } from "../../src/logic/calcularResultado";
import { validarCuestionario } from "../../src/validation/validarCuestionario";
import { crearDocumentosEnvioAtomico } from "./registroEnvio";
import {
  envioCompletoYaRegistrado,
  usuarioPuedeEditarCuestionario,
  validarDatosEnvioPublico,
  versionPublicadaCoincide,
} from "./submission";

initializeApp();
const firestore = getFirestore();
const region = "us-central1";

function emailDe(request: { auth?: { token: { email?: unknown; email_verified?: unknown } } }): string {
  const email = request.auth?.token.email;
  if (request.auth?.token.email_verified !== true || typeof email !== "string") {
    throw new HttpsError("permission-denied", "Se requiere una cuenta verificada.");
  }
  return email.toLowerCase();
}

async function autorizadoParaEditar(empresaId: string, email: string): Promise<boolean> {
  const empresa = await firestore.doc(`empresas/${empresaId}`).get();
  const plataforma = await firestore.doc(`plataformaAdmins/${email}`).get();
  const miembro = await firestore.doc(`empresas/${empresaId}/miembros/${email}`).get();
  return usuarioPuedeEditarCuestionario(
    empresa.data()?.estado === "activa",
    plataforma.exists,
    miembro.data(),
  );
}

export const gestionarPublicacionCopia = onCall({ region }, async (request) => {
  const data = request.data as unknown;
  if (
    typeof data !== "object" || data === null ||
    Object.keys(data).length !== 3 ||
    Object.keys(data).some((key) => !["empresaId", "cuestionarioId", "accion"].includes(key)) ||
    typeof (data as Record<string, unknown>).empresaId !== "string" ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(String((data as Record<string, unknown>).empresaId)) ||
    typeof (data as Record<string, unknown>).cuestionarioId !== "string" ||
    !["publicar", "despublicar"].includes(
      String((data as Record<string, unknown>).accion),
    )
  ) {
    throw new HttpsError("invalid-argument", "La operación de publicación no es válida.");
  }
  const entrada = data as {
    empresaId: string;
    cuestionarioId: string;
    accion: "publicar" | "despublicar";
  };
  if (!/^personalizado-[A-Za-z0-9_-]{1,120}$/.test(entrada.cuestionarioId)) {
    throw new HttpsError("invalid-argument", "Solo se pueden publicar copias personalizadas.");
  }
  const email = emailDe(request);
  if (!await autorizadoParaEditar(entrada.empresaId, email)) {
    throw new HttpsError("permission-denied", "No tienes permiso para publicar copias en esta empresa.");
  }

  const cuestionarioRef = firestore.doc(
    `empresas/${entrada.empresaId}/cuestionarios/${entrada.cuestionarioId}`,
  );
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cuestionarioRef);
    if (!snapshot.exists || snapshot.data()?.estado !== "borrador") {
      throw new HttpsError("not-found", "La copia no existe o no es un borrador.");
    }
    const actual = snapshot.data()!;
    if (actual.id !== entrada.cuestionarioId) {
      throw new HttpsError("failed-precondition", "El ID de la copia no coincide.");
    }
    if (entrada.accion === "despublicar") {
      transaction.update(cuestionarioRef, {
        publicacion: { estado: "borrador" },
      });
      return { estado: "borrador" };
    }

    const validacion = validarCuestionario(actual.configuracion);
    if (
      !validacion.valido ||
      validacion.data.id !== entrada.cuestionarioId ||
      typeof actual.nombre !== "string" ||
      actual.nombre.trim().length < 1 ||
      actual.nombre.trim().length > 120
    ) {
      throw new HttpsError("failed-precondition", "La copia no contiene un cuestionario válido.");
    }
    const versionId = `pub-${randomUUID()}`;
    const publicadoEn = Timestamp.now();
    const versionRef = cuestionarioRef.collection("versiones").doc(versionId);
    transaction.create(versionRef, {
      id: versionId,
      versionId,
      cuestionarioId: entrada.cuestionarioId,
      empresaId: entrada.empresaId,
      nombre: actual.nombre.trim(),
      configuracion: validacion.data,
      publicadoEn,
    });
    transaction.update(cuestionarioRef, {
      publicacion: {
        estado: "publicado",
        versionId,
        publicadoEn: FieldValue.serverTimestamp(),
        publicadoPor: email,
      },
    });
    return { estado: "publicado", versionId };
  });
});

export const enviarCopiaPublicada = onCall({ region }, async (request) => {
  const data = request.data as unknown;
  if (typeof data !== "object" || data === null) {
    throw new HttpsError("invalid-argument", "El envío no es válido.");
  }
  const registro = data as Record<string, unknown>;
  const empresaId = typeof registro.empresaId === "string" ? registro.empresaId : "";
  const cuestionarioId = typeof registro.cuestionarioId === "string"
    ? registro.cuestionarioId
    : "";
  const versionId = typeof registro.versionId === "string" ? registro.versionId : "";
  if (
    !/^[A-Za-z0-9_-]{1,120}$/.test(empresaId) ||
    !/^personalizado-[A-Za-z0-9_-]{1,120}$/.test(cuestionarioId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(versionId)
  ) {
    throw new HttpsError("invalid-argument", "La URL pública no es válida.");
  }
  const cuestionarioRef = firestore.doc(
    `empresas/${empresaId}/cuestionarios/${cuestionarioId}`,
  );
  const versionRef = cuestionarioRef.collection("versiones").doc(versionId);
  const empresaRef = firestore.doc(`empresas/${empresaId}`);
  const submissionId = typeof registro.submissionId === "string"
    ? registro.submissionId
    : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new HttpsError("invalid-argument", "El identificador del envío no es válido.");
  }
  const leadRef = firestore.doc(`empresas/${empresaId}/leads/${submissionId}`);
  const diagnosticoRef = firestore.doc(`empresas/${empresaId}/diagnosticos/${submissionId}`);

  try {
    await firestore.runTransaction(async (transaction) => {
      const [empresa, cuestionario, version, lead, diagnostico] = await Promise.all([
        transaction.get(empresaRef),
        transaction.get(cuestionarioRef),
        transaction.get(versionRef),
        transaction.get(leadRef),
        transaction.get(diagnosticoRef),
      ]);
      if (!cuestionario.exists || !version.exists || !versionPublicadaCoincide(
        empresaId,
        cuestionarioId,
        versionId,
        empresa.data(),
        cuestionario.data(),
        version.data(),
      )) {
        throw new HttpsError("permission-denied", "Esta versión no está publicada.");
      }
      try {
        if (envioCompletoYaRegistrado(lead.exists, diagnostico.exists)) {
          return;
        }
      } catch (error: unknown) {
        throw new HttpsError(
          "failed-precondition",
          error instanceof Error ? error.message : "El envío requiere revisión.",
        );
      }
      const configuracion = validarCuestionario(version.data()?.configuracion);
      if (!configuracion.valido) {
        throw new HttpsError("failed-precondition", "La versión publicada está dañada.");
      }
      let entrada: ReturnType<typeof validarDatosEnvioPublico>;
      try {
        entrada = validarDatosEnvioPublico(registro, configuracion.data);
      } catch (error: unknown) {
        throw new HttpsError(
          "invalid-argument",
          error instanceof Error ? error.message : "El envío no es válido.",
        );
      }
      const calculo = calcularResultado(configuracion.data, entrada.respuestas);
      if (calculo.estado !== "ok") {
        throw new HttpsError("failed-precondition", "No se pudo calcular el resultado.");
      }
      const fecha = Timestamp.now();
      const documentos = construirDocumentosCopia({
        id: submissionId,
        contacto: entrada.contacto,
        cuestionario: configuracion.data,
        respuestas: entrada.respuestas,
        calculo,
        contenidoPersonalizado: null,
        consentimientoAceptado: true,
        fecha,
      });
      crearDocumentosEnvioAtomico(
        transaction,
        leadRef,
        diagnosticoRef,
        documentos.lead,
        { ...documentos.diagnostico, versionId },
      );
    });
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "No se pudo guardar el envío.");
  }
  return { success: true };
});
