import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerPortal } from "../../server/suscripcion/handlers.ts";
import {
  conDependencias,
  registrarError,
} from "../../server/suscripcion/runtime.ts";

export default async function portal(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  try {
    await conDependencias(
      "suscripcion.portal",
      [],
      respuesta,
      (dependencias) => crearHandlerPortal(dependencias)(solicitud, respuesta),
    );
  } catch (error: unknown) {
    registrarError("suscripcion.portal", error);
    if (!respuesta.headersSent) {
      respuesta.status(500).json({ error: "No se pudo abrir el portal de suscripción." });
    }
  }
}
