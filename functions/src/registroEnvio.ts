import type {
  DocumentReference,
  DocumentData,
  Transaction,
} from "firebase-admin/firestore";

export function crearDocumentosEnvioAtomico(
  transaction: Transaction,
  leadRef: DocumentReference,
  diagnosticoRef: DocumentReference,
  lead: DocumentData,
  diagnostico: DocumentData,
): void {
  transaction.create(leadRef, lead);
  transaction.create(diagnosticoRef, diagnostico);
}
