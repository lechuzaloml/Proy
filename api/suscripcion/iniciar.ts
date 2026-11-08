import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.js";
import { crearHandlerIniciar } from "../../server/suscripcion/handlers.js";
import { conDependencias } from "../../server/suscripcion/runtime.js";

export default async function iniciar(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependencias(respuesta, (dependencias) =>
    crearHandlerIniciar(dependencias)(solicitud, respuesta)
  );
}
