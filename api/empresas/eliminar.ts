import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerEliminarEmpresa } from "../../server/empresas/handlers.ts";
import { conDependencias } from "../../server/suscripcion/runtime.ts";

export default async function eliminarEmpresa(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependencias(
    "empresas.eliminar",
    [],
    respuesta,
    (dependencias) =>
      crearHandlerEliminarEmpresa(dependencias)(solicitud, respuesta),
  );
}
