import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { construirDocumentosCopia } from "../../src/lib/construirDocumentosDiagnostico";
import { calcularResultado } from "../../src/logic/calcularResultado";
import { validarCuestionario } from "../../src/validation/validarCuestionario";
import { crearDocumentosEnvioAtomico } from "./registroEnvio";
import {
  envioCompletoYaRegistrado,
  validarDatosEnvioPublico,
  versionPublicadaCoincide,
} from "./submission";

initializeApp();
const firestore = getFirestore();
const region = "us-central1";

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
        cuestionarioId,
        versionId,
        empresa.data(),
        cuestionario.data(),
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
