import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerIniciar } from "../../server/suscripcion/handlers.ts";
import {
  conDependencias,
  registrarError,
} from "../../server/suscripcion/runtime.ts";

export default async function iniciar(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  try {
    await conDependencias(
      "suscripcion.iniciar",
      ["STRIPE_PRICE_ID"],
      respuesta,
      (dependencias) => crearHandlerIniciar(dependencias)(solicitud, respuesta),
    );
  } catch (error: unknown) {
    registrarError("suscripcion.iniciar", error);
    if (!respuesta.headersSent) {
      respuesta.status(500).json({ error: "No se pudo iniciar la suscripción." });
    }
  }
}
