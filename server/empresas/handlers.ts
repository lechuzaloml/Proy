import type { DependenciasSuscripcion } from "../suscripcion/runtime.ts";
import { ErrorApi, registrarError } from "../suscripcion/runtime.ts";
import type { RespuestaApi, SolicitudApi } from "../suscripcion/contratos.ts";
import {
  puedeEliminar,
  validarSlugEmpresaId,
} from "../../src/config/empresas.ts";

const REGEX_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function enviarError(
  respuesta: RespuestaApi,
  estado: number,
  error: string,
): void {
  respuesta.status(estado).json({ error });
}

function leerObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : null;
}

function tokenDeSolicitud(solicitud: SolicitudApi): string | null {
  const authorization = solicitud.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function estadoDeError(error: unknown): number {
  return error instanceof ErrorApi ? error.statusCode : 500;
}

function registrarPaso(paso: string): void {
  console.info(`[empresas.eliminar] ${paso}`);
}

export function crearHandlerEliminarEmpresa(
  dependencias: DependenciasSuscripcion,
) {
  return async (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ): Promise<void> => {
    let paso = "validar solicitud";
    try {
      if (solicitud.method !== "POST") {
        enviarError(respuesta, 405, "Este endpoint solo acepta POST.");
        return;
      }

      const token = tokenDeSolicitud(solicitud);
      if (!token) {
        enviarError(respuesta, 401, "Inicia sesión para continuar.");
        return;
      }

      paso = "verificar identidad";
      let correo: string;
      try {
        const identidad = await dependencias.auth.verifyIdToken(token);
        if (
          identidad.email_verified !== true ||
          typeof identidad.email !== "string" ||
          !REGEX_CORREO.test(identidad.email)
        ) {
          enviarError(respuesta, 403, "Verifica el correo de tu cuenta para continuar.");
          return;
        }
        correo = identidad.email.toLowerCase();
      } catch {
        enviarError(respuesta, 401, "La sesión no es válida o expiró.");
        return;
      }

      paso = "autorizar administrador de plataforma";
      const adminPlataforma = await dependencias.firestore
        .doc(`plataformaAdmins/${correo}`)
        .get();
      if (!adminPlataforma.exists) {
        enviarError(respuesta, 403, "Solo un administrador de plataforma puede eliminar empresas.");
        return;
      }

      const cuerpo = leerObjeto(solicitud.body);
      const empresaId = cuerpo?.empresaId;
      const liberarPrueba = cuerpo?.liberarPrueba;
      if (!validarSlugEmpresaId(empresaId)) {
        enviarError(respuesta, 400, "El ID de empresa no es válido o está protegido.");
        return;
      }
      if (typeof liberarPrueba !== "boolean") {
        enviarError(respuesta, 400, "Indica si se debe liberar la prueba gratuita.");
        return;
      }

      paso = "verificar empresa";
      const empresaRef = dependencias.firestore.doc(`empresas/${empresaId}`);
      const [empresa, suscripcion, propietarios] = await Promise.all([
        empresaRef.get(),
        dependencias.firestore.doc(`empresas/${empresaId}/suscripcion/actual`).get(),
        dependencias.firestore
          .collection(`empresas/${empresaId}/miembros`)
          .where("estado", "==", "activo")
          .where("rol", "==", "propietario")
          .limit(1)
          .get(),
      ]);
      if (empresa.exists && !puedeEliminar(
        empresa.data()?.estado,
        !propietarios.empty,
      )) {
        throw new ErrorApi(
          "La empresa tiene un propietario activo; suspéndela antes de eliminarla.",
          409,
        );
      }

      registrarPaso("autorización y condiciones verificadas");
      const stripeSubscriptionId = suscripcion.data()?.stripeSubscriptionId;
      if (
        typeof stripeSubscriptionId === "string" &&
        stripeSubscriptionId.length > 0 &&
        dependencias.stripeTestMode === true
      ) {
        paso = "cancelar suscripción de Stripe";
        registrarPaso(paso);
        const stripeSubscription = await dependencias.stripe.subscriptions
          .retrieve(stripeSubscriptionId);
        if (stripeSubscription.status !== "canceled") {
          await dependencias.stripe.subscriptions.cancel(stripeSubscriptionId);
        }
      }

      paso = "eliminar documentos de la empresa";
      registrarPaso(paso);
      await dependencias.firestore.recursiveDelete(empresaRef);

      if (liberarPrueba) {
        paso = "liberar prueba gratuita";
        registrarPaso(paso);
        const pruebas = await dependencias.firestore
          .collection("pruebas")
          .where("slug", "==", empresaId)
          .get();
        await Promise.all(pruebas.docs.map((prueba) => prueba.ref.delete()));
      }

      registrarPaso("eliminación completada");
      respuesta.status(200).json({ ok: true });
    } catch (error: unknown) {
      registrarError(`empresas.eliminar.${paso}`, error);
      enviarError(
        respuesta,
        estadoDeError(error),
        error instanceof ErrorApi
          ? error.message
          : "No se pudo eliminar la empresa.",
      );
    }
  };
}
