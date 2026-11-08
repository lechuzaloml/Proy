import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.js";
import { crearHandlerWebhook } from "../../server/suscripcion/handlers.js";
import { conDependencias } from "../../server/suscripcion/runtime.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function webhook(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  await conDependencias(respuesta, (dependencias) =>
    crearHandlerWebhook(dependencias)(solicitud, respuesta)
  );
}
