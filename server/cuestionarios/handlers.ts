import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type {
  DocumentData,
  Firestore,
  Query,
} from "firebase-admin/firestore";
import { limiteDePlan, puedePublicarMas } from "../../src/config/planes.ts";
import { validarCuestionario } from "../../src/validation/validarCuestionario.ts";
import type { RespuestaApi, SolicitudApi } from "../suscripcion/contratos.ts";
import { ErrorApi } from "../suscripcion/runtime.ts";

export interface DependenciasPublicacion {
  auth: Pick<Auth, "verifyIdToken">;
  firestore: Firestore;
  serverTimestamp: () => unknown;
  crearIdVersion?: () => string;
}

interface IdentidadVerificada {
  correo: string;
}

interface RespuestaUso {
  ok: true;
  usados: number;
  limite: number | null;
}

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

function validarId(valor: unknown): valor is string {
  return typeof valor === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(valor);
}

function validarBody(
  body: unknown,
): { empresaId: string; cuestionarioId: string } | null {
  const objeto = leerObjeto(body);
  if (
    !objeto ||
    Object.keys(objeto).some((clave) =>
      clave !== "empresaId" && clave !== "cuestionarioId"
    ) ||
    !validarId(objeto.empresaId) ||
    !validarId(objeto.cuestionarioId)
  ) {
    return null;
  }
  return {
    empresaId: objeto.empresaId,
    cuestionarioId: objeto.cuestionarioId,
  };
}

async function verificarIdentidad(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
  auth: Pick<Auth, "verifyIdToken">,
): Promise<IdentidadVerificada | null> {
  const authorization = solicitud.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    enviarError(respuesta, 401, "Inicia sesión para continuar.");
    return null;
  }
  try {
    const usuario = await auth.verifyIdToken(token);
    if (
      usuario.email_verified !== true ||
      typeof usuario.email !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(usuario.email)
    ) {
      enviarError(respuesta, 403, "Verifica el correo de tu cuenta para continuar.");
      return null;
    }
    return { correo: usuario.email.toLowerCase() };
  } catch {
    enviarError(respuesta, 401, "La sesión no es válida o expiró.");
    return null;
  }
}

function limiteJson(limite: number): number | null {
  return Number.isFinite(limite) ? limite : null;
}

function idsPublicados(valor: unknown): string[] {
  if (
    !Array.isArray(valor) ||
    !valor.every((id) => typeof id === "string")
  ) {
    throw new ErrorApi(
      "El registro de cupo de cuestionarios no tiene un formato válido.",
      500,
    );
  }
  return [...new Set(valor)];
}

function publicadosQuery(firestore: Firestore, empresaId: string): Query<DocumentData> {
  return firestore.collection(`empresas/${empresaId}/cuestionarios`)
    .where("estado", "==", "publicado");
}

function revisarAutorizacion(
  correo: string,
  empresa: DocumentData,
  miembro: DocumentData | undefined,
  esPlataforma: boolean,
  suscripcion: DocumentData | undefined,
): { planId: string; limite: number } {
  if (empresa.estado !== "activa") {
    throw new ErrorApi("La empresa está suspendida.", 403);
  }
  const rolAutorizado = miembro?.estado === "activo" &&
    (miembro.rol === "admin" || miembro.rol === "propietario");
  const permisos =
    typeof miembro?.permisos === "object" && miembro.permisos !== null
      ? miembro.permisos as Record<string, unknown>
      : {};
  const permisosAutorizados = miembro?.estado === "activo" &&
    permisos.editarCuestionarios === true &&
    permisos.publicarCuestionarios === true;
  if (!esPlataforma && !rolAutorizado && !permisosAutorizados) {
    throw new ErrorApi(
      `La cuenta ${correo} no tiene permiso para publicar cuestionarios en esta empresa.`,
      403,
    );
  }

  const planId = typeof empresa.planId === "string" ? empresa.planId : "";
  if (
    planId !== "interno" &&
    suscripcion?.estado !== "prueba" &&
    suscripcion?.estado !== "activa"
  ) {
    throw new ErrorApi(
      "La suscripción de la empresa no está activa ni en prueba.",
      403,
    );
  }
  return { planId, limite: limiteDePlan(planId) };
}

async function ejecutarPublicacion(
  dependencias: DependenciasPublicacion,
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  if (solicitud.method !== "POST") {
    enviarError(respuesta, 405, "Este endpoint solo acepta POST.");
    return;
  }
  const identidad = await verificarIdentidad(
    solicitud,
    respuesta,
    dependencias.auth,
  );
  if (!identidad) {
    return;
  }
  const ids = validarBody(solicitud.body);
  if (!ids) {
    enviarError(respuesta, 400, "Se requieren empresaId y cuestionarioId válidos.");
    return;
  }

  try {
    const resultado = await dependencias.firestore.runTransaction(
      async (transaccion): Promise<RespuestaUso> => {
        const empresaRef = dependencias.firestore.doc(`empresas/${ids.empresaId}`);
        const miembroRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/miembros/${identidad.correo}`,
        );
        const plataformaRef = dependencias.firestore.doc(
          `plataformaAdmins/${identidad.correo}`,
        );
        const suscripcionRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/suscripcion/actual`,
        );
        const cuestionarioRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/cuestionarios/${ids.cuestionarioId}`,
        );
        const usoRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/uso/cuestionarios`,
        );
        const [
          empresaSnap,
          miembroSnap,
          plataformaSnap,
          suscripcionSnap,
          cuestionarioSnap,
          usoSnap,
        ] = await Promise.all([
          transaccion.get(empresaRef),
          transaccion.get(miembroRef),
          transaccion.get(plataformaRef),
          transaccion.get(suscripcionRef),
          transaccion.get(cuestionarioRef),
          transaccion.get(usoRef),
        ]);
        if (!empresaSnap.exists) {
          throw new ErrorApi("La empresa no existe.", 404);
        }
        const empresa = empresaSnap.data() ?? {};
        const miembro = miembroSnap.exists ? miembroSnap.data() : undefined;
        const suscripcion = suscripcionSnap.exists
          ? suscripcionSnap.data()
          : undefined;
        const { limite } = revisarAutorizacion(
          identidad.correo,
          empresa,
          miembro,
          plataformaSnap.exists,
          suscripcion,
        );
        if (!cuestionarioSnap.exists) {
          throw new ErrorApi("El cuestionario no existe.", 404);
        }
        const cuestionario = cuestionarioSnap.data() ?? {};
        if (cuestionario.estado !== "borrador") {
          throw new ErrorApi("Solo se pueden publicar cuestionarios en borrador.", 409);
        }
        const validacion = validarCuestionario(cuestionario.configuracion);
        if (!validacion.valido) {
          throw new ErrorApi(
            `La configuración del cuestionario no es válida: ${validacion.errores.join(" ")}`,
            400,
          );
        }

        const existentes = usoSnap.exists
          ? idsPublicados(usoSnap.data()?.publicados)
          : (await transaccion.get(
            publicadosQuery(dependencias.firestore, ids.empresaId),
          )).docs.map((documento) => documento.id);
        const publicados = [...new Set(existentes)];
        if (publicados.includes(ids.cuestionarioId)) {
          throw new ErrorApi(
            "El contador de cuestionarios publicados está desactualizado.",
            409,
          );
        }
        if (!puedePublicarMas(publicados.length, limite)) {
          throw new ErrorApi(
            "Alcanzaste el límite de tu plan: despublica uno o cambia de plan.",
            403,
          );
        }

        const versionesQuery = dependencias.firestore.collection(
          `empresas/${ids.empresaId}/cuestionarios/${ids.cuestionarioId}/versiones`,
        );
        const versiones = await transaccion.get(versionesQuery);
        const numero = versiones.docs.reduce((mayor, version) => {
          const valor = version.data().numero;
          return typeof valor === "number" && Number.isFinite(valor)
            ? Math.max(mayor, valor)
            : mayor;
        }, 0) + 1;
        const versionId = dependencias.crearIdVersion?.() ?? randomUUID();
        const versionRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/cuestionarios/${ids.cuestionarioId}/versiones/${versionId}`,
        );
        const siguientesPublicados = [...publicados, ids.cuestionarioId];

        transaccion.set(versionRef, {
          numero,
          configuracion: validacion.data,
          publicadaEn: dependencias.serverTimestamp(),
          creadoPor: identidad.correo,
        });
        transaccion.update(cuestionarioRef, {
          estado: "publicado",
          versionActualId: versionId,
          actualizadoEn: dependencias.serverTimestamp(),
        });
        transaccion.set(usoRef, {
          publicados: siguientesPublicados,
          actualizadoEn: dependencias.serverTimestamp(),
        });
        return {
          ok: true,
          usados: siguientesPublicados.length,
          limite: limiteJson(limite),
        };
      },
    );
    respuesta.status(200).json(resultado);
  } catch (error: unknown) {
    if (error instanceof ErrorApi) {
      enviarError(respuesta, error.statusCode, error.message);
      return;
    }
    console.error("[cuestionarios.publicar] Error al publicar.", error);
    enviarError(respuesta, 500, "No se pudo publicar el cuestionario.");
  }
}

async function ejecutarDespublicacion(
  dependencias: DependenciasPublicacion,
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): Promise<void> {
  if (solicitud.method !== "POST") {
    enviarError(respuesta, 405, "Este endpoint solo acepta POST.");
    return;
  }
  const identidad = await verificarIdentidad(
    solicitud,
    respuesta,
    dependencias.auth,
  );
  if (!identidad) {
    return;
  }
  const ids = validarBody(solicitud.body);
  if (!ids) {
    enviarError(respuesta, 400, "Se requieren empresaId y cuestionarioId válidos.");
    return;
  }

  try {
    const resultado = await dependencias.firestore.runTransaction(
      async (transaccion): Promise<RespuestaUso> => {
        const empresaRef = dependencias.firestore.doc(`empresas/${ids.empresaId}`);
        const miembroRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/miembros/${identidad.correo}`,
        );
        const plataformaRef = dependencias.firestore.doc(
          `plataformaAdmins/${identidad.correo}`,
        );
        const suscripcionRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/suscripcion/actual`,
        );
        const cuestionarioRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/cuestionarios/${ids.cuestionarioId}`,
        );
        const usoRef = dependencias.firestore.doc(
          `empresas/${ids.empresaId}/uso/cuestionarios`,
        );
        const [
          empresaSnap,
          miembroSnap,
          plataformaSnap,
          suscripcionSnap,
          cuestionarioSnap,
          usoSnap,
        ] = await Promise.all([
          transaccion.get(empresaRef),
          transaccion.get(miembroRef),
          transaccion.get(plataformaRef),
          transaccion.get(suscripcionRef),
          transaccion.get(cuestionarioRef),
          transaccion.get(usoRef),
        ]);
        if (!empresaSnap.exists) {
          throw new ErrorApi("La empresa no existe.", 404);
        }
        const empresa = empresaSnap.data() ?? {};
        const miembro = miembroSnap.exists ? miembroSnap.data() : undefined;
        const suscripcion = suscripcionSnap.exists
          ? suscripcionSnap.data()
          : undefined;
        const { limite } = revisarAutorizacion(
          identidad.correo,
          empresa,
          miembro,
          plataformaSnap.exists,
          suscripcion,
        );
        if (!cuestionarioSnap.exists) {
          throw new ErrorApi("El cuestionario no existe.", 404);
        }
        if (cuestionarioSnap.data()?.estado !== "publicado") {
          throw new ErrorApi("El cuestionario no está publicado.", 409);
        }

        const existentes = usoSnap.exists
          ? idsPublicados(usoSnap.data()?.publicados)
          : (await transaccion.get(
            publicadosQuery(dependencias.firestore, ids.empresaId),
          )).docs.map((documento) => documento.id);
        const siguientesPublicados = idsPublicados(existentes)
          .filter((id) => id !== ids.cuestionarioId);
        transaccion.update(cuestionarioRef, {
          estado: "borrador",
          actualizadoEn: dependencias.serverTimestamp(),
        });
        transaccion.set(usoRef, {
          publicados: siguientesPublicados,
          actualizadoEn: dependencias.serverTimestamp(),
        });
        return {
          ok: true,
          usados: siguientesPublicados.length,
          limite: limiteJson(limite),
        };
      },
    );
    respuesta.status(200).json(resultado);
  } catch (error: unknown) {
    if (error instanceof ErrorApi) {
      enviarError(respuesta, error.statusCode, error.message);
      return;
    }
    console.error("[cuestionarios.despublicar] Error al despublicar.", error);
    enviarError(respuesta, 500, "No se pudo despublicar el cuestionario.");
  }
}

export function crearHandlerPublicar(dependencias: DependenciasPublicacion) {
  return (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ) => ejecutarPublicacion(dependencias, solicitud, respuesta);
}

export function crearHandlerDespublicar(dependencias: DependenciasPublicacion) {
  return (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ) => ejecutarDespublicacion(dependencias, solicitud, respuesta);
}
