import type { RespuestaApi, SolicitudApi } from "../../server/suscripcion/contratos.ts";
import { crearHandlerEstado } from "../../server/suscripcion/handlers.ts";
import {
  conDependencias,
  registrarError,
} from "../../server/suscripcion/runtime.ts";

export default async function estado(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  try {
    await conDependencias(
      "suscripcion.estado",
      [],
      respuesta,
      (dependencias) => crearHandlerEstado(dependencias)(solicitud, respuesta),
    );
  } catch (error: unknown) {
    registrarError("suscripcion.estado", error);
    if (!respuesta.headersSent) {
      respuesta.status(500).json({ error: "No se pudo consultar la suscripción." });
    }
  }
}
