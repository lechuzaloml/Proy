import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.js";
import { crearHandlerPortal } from "../../server/suscripcion/handlers.js";
import { conDependencias } from "../../server/suscripcion/runtime.js";

export default async function portal(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependencias(respuesta, (dependencias) =>
    crearHandlerPortal(dependencias)(solicitud, respuesta)
  );
}
