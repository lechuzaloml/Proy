import { doc, setDoc } from "firebase/firestore";
import type { DocumentoLead } from "../types/documentoLead";
import { db } from "./firebase";

export async function guardarLead(
  idIntento: string,
  documento: DocumentoLead,
): Promise<void> {
  if (!db) {
    return;
  }
  await setDoc(doc(db, "leads", idIntento), documento);
}
