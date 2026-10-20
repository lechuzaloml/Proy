import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { EMPRESA_ID } from "../config/firebaseDatos";
import type { DocumentosDiagnostico } from "./construirDocumentosDiagnostico";
import { db } from "./firebase";

export async function guardarDiagnostico(
  id: string,
  documentos: DocumentosDiagnostico,
): Promise<boolean> {
  if (!db) {
    return false;
  }

  const lote = writeBatch(db);
  const marcaServidor = serverTimestamp();
  lote.set(doc(db, "empresas", EMPRESA_ID, "leads", id), {
    ...documentos.lead,
    consentimiento: {
      ...documentos.lead.consentimiento,
      fecha: marcaServidor,
    },
    ultimaActividadEn: marcaServidor,
    creadoEn: marcaServidor,
  });
  lote.set(doc(db, "empresas", EMPRESA_ID, "diagnosticos", id), {
    ...documentos.diagnostico,
    completadoEn: marcaServidor,
  });
  await lote.commit();
  return true;
}
