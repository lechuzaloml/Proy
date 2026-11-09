import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerWebhook } from "../../server/suscripcion/handlers.ts";
import { conDependencias, registrarError } from "../../server/suscripcion/runtime.ts";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function webhook(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  try {
    await conDependencias(
      "stripe.webhook",
      ["STRIPE_WEBHOOK_SECRET"],
      respuesta,
      (dependencias) => crearHandlerWebhook(dependencias)(solicitud, respuesta),
    );
  } catch (error: unknown) {
    registrarError("stripe.webhook", error);
    if (!respuesta.headersSent) {
      respuesta.status(500).json({ error: "No se pudo procesar el webhook." });
    }
  }
}
