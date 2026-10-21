import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { DocumentosDiagnostico } from "./construirDocumentosDiagnostico";
import { db } from "./firebase";

export async function guardarDiagnostico(
  empresaId: string,
  id: string,
  documentos: DocumentosDiagnostico,
): Promise<boolean> {
  if (!db) {
    return false;
  }

  const lote = writeBatch(db);
  const marcaServidor = serverTimestamp();
  lote.set(doc(db, "empresas", empresaId, "leads", id), {
    ...documentos.lead,
    consentimiento: {
      ...documentos.lead.consentimiento,
      fecha: marcaServidor,
    },
    ultimaActividadEn: marcaServidor,
    creadoEn: marcaServidor,
  });
  lote.set(doc(db, "empresas", empresaId, "diagnosticos", id), {
    ...documentos.diagnostico,
    completadoEn: marcaServidor,
  });
  await lote.commit();
  return true;
}
