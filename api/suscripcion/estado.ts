import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.js";
import { crearHandlerEstado } from "../../server/suscripcion/handlers.js";
import { conDependencias } from "../../server/suscripcion/runtime.js";

export default async function estado(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependencias(respuesta, (dependencias) =>
    crearHandlerEstado(dependencias)(solicitud, respuesta)
  );
}
