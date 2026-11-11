import { FieldValue } from "firebase-admin/firestore";
import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerDespublicar } from "../../server/cuestionarios/handlers.ts";
import { conDependenciasCuestionarios } from "../../server/cuestionarios/runtime.ts";

export default async function despublicar(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependenciasCuestionarios(respuesta, (dependencias) =>
    crearHandlerDespublicar({
      ...dependencias,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    })(solicitud, respuesta)
  );
}
