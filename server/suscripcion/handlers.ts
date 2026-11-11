import type { Auth } from "firebase-admin/auth";
import type {
  DocumentData,
  Transaction,
} from "firebase-admin/firestore";
import type Stripe from "stripe";
import { DIAS_PRUEBA, PRECIO, PRECIO_PROVISIONAL } from "../../src/config/suscripcion.ts";
import type { RespuestaApi, SolicitudApi } from "./contratos.ts";
import {
  registrarError,
  type DependenciasSuscripcion,
} from "./runtime.ts";

const SLUG_RESERVADOS = new Set([
  "admin",
  "e",
  "api",
  "assets",
  "static",
  "login",
  "clearia",
]);
const PATRON_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validarSlug(slug: unknown): slug is string {
  return typeof slug === "string" &&
    /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) &&
    !SLUG_RESERVADOS.has(slug);
}

export function validarNombre(nombre: unknown): nombre is string {
  return typeof nombre === "string" &&
    nombre.trim().length >= 1 &&
    nombre.trim().length <= 80;
}

type EstadoSuscripcion = "prueba" | "activa" | "pago_pendiente" | "cancelada";
type EstadoEmpresa = "activa" | "suspendida";

interface CambioEstadoSuscripcion {
  estadoSuscripcion: EstadoSuscripcion;
  estadoEmpresa?: EstadoEmpresa;
}

export function estadoSegunEvento(
  tipo: string,
  estadoStripe?: string,
): CambioEstadoSuscripcion | null {
  if (tipo === "invoice.paid") {
    return { estadoSuscripcion: "activa", estadoEmpresa: "activa" };
  }
  if (tipo === "invoice.payment_failed") {
    return { estadoSuscripcion: "pago_pendiente" };
  }
  if (tipo === "customer.subscription.deleted" || estadoStripe === "canceled" || estadoStripe === "unpaid") {
    return { estadoSuscripcion: "cancelada", estadoEmpresa: "suspendida" };
  }
  if (tipo !== "customer.subscription.updated") {
    return null;
  }
  if (estadoStripe === "trialing") {
    return { estadoSuscripcion: "prueba", estadoEmpresa: "activa" };
  }
  if (estadoStripe === "active") {
    return { estadoSuscripcion: "activa", estadoEmpresa: "activa" };
  }
  return { estadoSuscripcion: "pago_pendiente" };
}

interface DecisionCheckout {
  empresaExiste: boolean;
  suscripcionCoincide: boolean;
  miembroExiste: boolean;
  pruebaExiste: boolean;
  slugPruebaCoincide: boolean;
}

export function decidirCheckout(
  decision: DecisionCheckout,
): "crear" | "duplicado" | "cancelar" {
  if (
    decision.empresaExiste &&
    decision.suscripcionCoincide &&
    decision.miembroExiste &&
    decision.pruebaExiste &&
    decision.slugPruebaCoincide
  ) {
    return "duplicado";
  }
  if (decision.empresaExiste || decision.pruebaExiste) {
    return "cancelar";
  }
  return "crear";
}

function enviarError(
  respuesta: RespuestaApi,
  estado: number,
  error: string,
): void {
  respuesta.status(estado).json({ error });
}

function leerObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null
    ? valor as Record<string, unknown>
    : null;
}

interface IdentidadVerificada {
  correo: string;
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
      !PATRON_CORREO.test(usuario.email)
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

function validarMetodoPost(
  solicitud: SolicitudApi,
  respuesta: RespuestaApi,
): boolean {
  if (solicitud.method === "POST") {
    return true;
  }
  respuesta.status(405).json({ error: "Este endpoint solo acepta POST." });
  return false;
}

export function crearHandlerIniciar(dependencias: DependenciasSuscripcion) {
  return async (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ): Promise<void> => {
    if (!validarMetodoPost(solicitud, respuesta)) {
      return;
    }
    if (!dependencias.priceId) {
      enviarError(respuesta, 503, "Stripe no está configurado para suscripciones.");
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

    const body = leerObjeto(solicitud.body);
    const slug = body?.slug;
    const nombre = body?.nombre;
    if (!validarSlug(slug)) {
      enviarError(respuesta, 400, "El identificador de empresa no es válido.");
      return;
    }
    if (!validarNombre(nombre)) {
      enviarError(respuesta, 400, "El nombre debe tener entre 1 y 80 caracteres.");
      return;
    }

    try {
      const empresaRef = dependencias.firestore.doc(`empresas/${slug}`);
      const pruebaRef = dependencias.firestore.doc(`pruebas/${identidad.correo}`);
      const [empresa, prueba] = await Promise.all([
        empresaRef.get(),
        pruebaRef.get(),
      ]);
      if (empresa.exists) {
        enviarError(respuesta, 409, "Ya existe una empresa con ese identificador.");
        return;
      }
      if (prueba.exists) {
        enviarError(respuesta, 409, "Esta cuenta ya utilizó su prueba gratuita.");
        return;
      }

      const metadata = {
        slug,
        nombre: nombre.trim(),
        correo: identidad.correo,
      };
      const session = await dependencias.stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: dependencias.priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: DIAS_PRUEBA,
          metadata,
        },
        customer_email: identidad.correo,
        client_reference_id: slug,
        metadata,
        success_url:
          `${dependencias.appUrl}/suscripcion?checkout=success&slug=${encodeURIComponent(slug)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${dependencias.appUrl}/suscripcion?checkout=cancelled`,
      });
      if (!session.url) {
        enviarError(respuesta, 502, "Stripe no devolvió la dirección de Checkout.");
        return;
      }
      respuesta.status(200).json({ url: session.url });
    } catch (error: unknown) {
      registrarError("suscripcion.iniciar.checkout", error);
      enviarError(respuesta, 502, "No se pudo iniciar el pago de prueba.");
    }
  };
}

export function crearHandlerPortal(dependencias: DependenciasSuscripcion) {
  return async (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ): Promise<void> => {
    if (!validarMetodoPost(solicitud, respuesta)) {
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
    const body = leerObjeto(solicitud.body);
    const slug = body?.slug;
    if (!validarSlug(slug)) {
      enviarError(respuesta, 400, "El identificador de empresa no es válido.");
      return;
    }

    try {
      const miembro = await dependencias.firestore
        .doc(`empresas/${slug}/miembros/${identidad.correo}`)
        .get();
      const datosMiembro = miembro.data();
      if (
        !miembro.exists ||
        datosMiembro?.estado !== "activo" ||
        !["propietario", "admin"].includes(String(datosMiembro?.rol))
      ) {
        enviarError(respuesta, 403, "Solo un propietario o administrador puede gestionar la suscripción.");
        return;
      }

      const actual = await dependencias.firestore
        .doc(`empresas/${slug}/suscripcion/actual`)
        .get();
      const stripeCustomerId = actual.data()?.stripeCustomerId;
      if (!actual.exists || typeof stripeCustomerId !== "string") {
        enviarError(respuesta, 404, "No hay una suscripción para administrar.");
        return;
      }

      const portal = await dependencias.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${dependencias.appUrl}/admin?empresa=${encodeURIComponent(slug)}`,
      });
      respuesta.status(200).json({ url: portal.url });
    } catch (error: unknown) {
      registrarError("suscripcion.portal.checkout", error);
      enviarError(respuesta, 502, "No se pudo abrir el portal de suscripción.");
    }
  };
}

function fechaIso(valor: unknown): string | null {
  if (valor instanceof Date && Number.isFinite(valor.getTime())) {
    return valor.toISOString();
  }
  const objeto = leerObjeto(valor);
  if (typeof objeto?.toDate === "function") {
    const fecha = (objeto.toDate as () => unknown)();
    return fecha instanceof Date && Number.isFinite(fecha.getTime())
      ? fecha.toISOString()
      : null;
  }
  return null;
}

export function crearHandlerEstado(dependencias: DependenciasSuscripcion) {
  return async (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ): Promise<void> => {
    if (!validarMetodoPost(solicitud, respuesta)) {
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
    const body = leerObjeto(solicitud.body);
    const slug = body?.slug;
    if (!validarSlug(slug)) {
      enviarError(respuesta, 400, "El identificador de empresa no es válido.");
      return;
    }

    try {
      const miembro = await dependencias.firestore
        .doc(`empresas/${slug}/miembros/${identidad.correo}`)
        .get();
      const datosMiembro = miembro.data();
      if (
        !miembro.exists ||
        datosMiembro?.estado !== "activo" ||
        !["propietario", "admin"].includes(String(datosMiembro?.rol))
      ) {
        enviarError(respuesta, 403, "Solo un propietario o administrador puede consultar la suscripción.");
        return;
      }

      const actual = await dependencias.firestore
        .doc(`empresas/${slug}/suscripcion/actual`)
        .get();
      if (!actual.exists) {
        respuesta.status(200).json({ suscripcion: null });
        return;
      }
      const datos = actual.data() ?? {};
      respuesta.status(200).json({
        suscripcion: {
          estado: typeof datos.estado === "string" ? datos.estado : "desconocido",
          pruebaHasta: fechaIso(datos.pruebaHasta),
        },
      });
    } catch (error: unknown) {
      registrarError("suscripcion.estado.firestore", error);
      enviarError(respuesta, 500, "No se pudo consultar la suscripción.");
    }
  };
}

function idStripe(valor: unknown): string | null {
  if (typeof valor === "string" && valor.length > 0) {
    return valor;
  }
  const objeto = leerObjeto(valor);
  return typeof objeto?.id === "string" ? objeto.id : null;
}

function metadataString(
  metadata: Stripe.Metadata | null | undefined,
  clave: string,
): string | null {
  const valor = metadata?.[clave];
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function decisionEnTransaccion(
  empresa: DocumentData | undefined,
  suscripcion: DocumentData | undefined,
  miembro: DocumentData | undefined,
  prueba: DocumentData | undefined,
  stripeSubscriptionId: string,
  slug: string,
): "crear" | "duplicado" | "cancelar" {
  return decidirCheckout({
    empresaExiste: empresa !== undefined,
    suscripcionCoincide:
      suscripcion?.stripeSubscriptionId === stripeSubscriptionId,
    miembroExiste: miembro !== undefined,
    pruebaExiste: prueba !== undefined,
    slugPruebaCoincide: prueba?.slug === slug,
  });
}

async function registrarCheckout(
  dependencias: DependenciasSuscripcion,
  datos: {
    slug: string;
    nombre: string;
    correo: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    pruebaHasta: Date;
  },
): Promise<"creado" | "duplicado" | "conflicto"> {
  const {
    slug,
    nombre,
    correo,
    stripeCustomerId,
    stripeSubscriptionId,
    pruebaHasta,
  } = datos;
  const empresaRef = dependencias.firestore.doc(`empresas/${slug}`);
  const miembroRef = dependencias.firestore.doc(`empresas/${slug}/miembros/${correo}`);
  const suscripcionRef = dependencias.firestore.doc(`empresas/${slug}/suscripcion/actual`);
  const pruebaRef = dependencias.firestore.doc(`pruebas/${correo}`);
  const ahora = new Date();

  return dependencias.firestore.runTransaction(async (transaccion: Transaction) => {
    const [empresa, miembro, suscripcion, prueba] = await Promise.all([
      transaccion.get(empresaRef),
      transaccion.get(miembroRef),
      transaccion.get(suscripcionRef),
      transaccion.get(pruebaRef),
    ]);
    const decision = decisionEnTransaccion(
      empresa.data(),
      suscripcion.data(),
      miembro.data(),
      prueba.data(),
      stripeSubscriptionId,
      slug,
    );
    if (decision === "duplicado") {
      return "duplicado";
    }
    if (decision === "cancelar") {
      return "conflicto";
    }

    transaccion.set(empresaRef, {
      nombre,
      estado: "activa",
      planId: "prueba",
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
    transaccion.set(miembroRef, {
      correo,
      rol: "propietario",
      estado: "activo",
      permisos: {
        verLeads: true,
        gestionarLeads: true,
        editarCuestionarios: true,
        publicarCuestionarios: true,
      },
      creadoEn: ahora,
    });
    transaccion.set(suscripcionRef, {
      estado: "prueba",
      pruebaHasta,
      stripeCustomerId,
      stripeSubscriptionId,
      precio: PRECIO,
      precioProvisional: PRECIO_PROVISIONAL,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
    transaccion.set(pruebaRef, { slug, creadoEn: ahora });
    return "creado";
  });
}

async function leerCuerpoCrudo(solicitud: SolicitudApi): Promise<Buffer> {
  if (Buffer.isBuffer(solicitud.body)) {
    return solicitud.body;
  }
  if (typeof solicitud.body === "string") {
    return Buffer.from(solicitud.body);
  }
  const fragmentos: Buffer[] = [];
  let bytes = 0;
  for await (const fragmento of solicitud) {
    const buffer = Buffer.from(fragmento);
    bytes += buffer.length;
    if (bytes > 1_000_000) {
      throw new Error("El cuerpo del webhook excede el límite.");
    }
    fragmentos.push(buffer);
  }
  return Buffer.concat(fragmentos);
}

function suscripcionDeFactura(factura: Record<string, unknown>): string | null {
  const directId = idStripe(factura.subscription);
  if (directId) {
    return directId;
  }
  const parent = leerObjeto(factura.parent);
  const details = leerObjeto(parent?.subscription_details);
  return idStripe(details?.subscription);
}

async function sincronizarSuscripcion(
  dependencias: DependenciasSuscripcion,
  slug: string,
  stripeSubscriptionId: string,
  cambio: CambioEstadoSuscripcion,
): Promise<boolean> {
  const empresaRef = dependencias.firestore.doc(`empresas/${slug}`);
  const suscripcionRef = dependencias.firestore.doc(`empresas/${slug}/suscripcion/actual`);
  return dependencias.firestore.runTransaction(async (transaccion) => {
    const [empresa, suscripcion] = await Promise.all([
      transaccion.get(empresaRef),
      transaccion.get(suscripcionRef),
    ]);
    if (
      !empresa.exists ||
      !suscripcion.exists ||
      suscripcion.data()?.stripeSubscriptionId !== stripeSubscriptionId
    ) {
      return false;
    }
    const ahora = new Date();
    transaccion.set(suscripcionRef, {
      estado: cambio.estadoSuscripcion,
      actualizadoEn: ahora,
    }, { merge: true });
    if (cambio.estadoEmpresa) {
      transaccion.set(empresaRef, {
        estado: cambio.estadoEmpresa,
        actualizadoEn: ahora,
      }, { merge: true });
    }
    return true;
  });
}

export function crearHandlerWebhook(dependencias: DependenciasSuscripcion) {
  return async (
    solicitud: SolicitudApi,
    respuesta: RespuestaApi,
  ): Promise<void> => {
    if (!validarMetodoPost(solicitud, respuesta)) {
      return;
    }
    if (!dependencias.webhookSecret) {
      enviarError(respuesta, 503, "El webhook de Stripe no está configurado.");
      return;
    }
    const firmaHeader = solicitud.headers["stripe-signature"];
    const firma = Array.isArray(firmaHeader) ? firmaHeader[0] : firmaHeader;
    if (!firma) {
      enviarError(respuesta, 400, "Falta la firma del webhook de Stripe.");
      return;
    }

    let evento: Stripe.Event;
    try {
      evento = dependencias.stripe.webhooks.constructEvent(
        await leerCuerpoCrudo(solicitud),
        firma,
        dependencias.webhookSecret,
      );
    } catch (error: unknown) {
      registrarError("stripe.webhook.signature", error);
      enviarError(respuesta, 400, "La firma del webhook no es válida.");
      return;
    }

    try {
      const objeto = evento.data.object as unknown as Record<string, unknown>;
      if (evento.type === "checkout.session.completed") {
        const session = objeto as unknown as Stripe.Checkout.Session;
        if (session.mode !== "subscription") {
          respuesta.status(200).json({ recibido: true });
          return;
        }
        const metadata = session.metadata;
        const slug = metadataString(metadata, "slug") ??
          (typeof session.client_reference_id === "string"
            ? session.client_reference_id
            : null);
        const nombre = metadataString(metadata, "nombre");
        const correo = metadataString(metadata, "correo")?.toLowerCase() ?? null;
        const subscriptionId = idStripe(session.subscription);
        const customerId = idStripe(session.customer);
        if (
          !validarSlug(slug) ||
          !validarNombre(nombre) ||
          !correo ||
          !PATRON_CORREO.test(correo) ||
          !subscriptionId ||
          !customerId
        ) {
          enviarError(respuesta, 400, "La sesión completada no contiene los datos requeridos.");
          return;
        }
        const subscription = await dependencias.stripe.subscriptions.retrieve(
          subscriptionId,
        );
        if (
          typeof subscription.trial_end !== "number" ||
          !Number.isFinite(subscription.trial_end)
        ) {
          enviarError(respuesta, 400, "La suscripción no contiene una fecha de prueba válida.");
          return;
        }
        const resultado = await registrarCheckout(dependencias, {
          slug,
          nombre: nombre.trim(),
          correo,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          pruebaHasta: new Date(subscription.trial_end * 1000),
        });
        if (resultado === "conflicto") {
          console.error(
            "[stripe.webhook.checkout] Conflicto de empresa o prueba; se cancelará la suscripción duplicada.",
          );
          await dependencias.stripe.subscriptions.cancel(subscriptionId);
        }
        respuesta.status(200).json({
          recibido: true,
          duplicado: resultado !== "creado",
        });
        return;
      }

      if (
        evento.type === "invoice.paid" ||
        evento.type === "invoice.payment_failed" ||
        evento.type === "customer.subscription.updated" ||
        evento.type === "customer.subscription.deleted"
      ) {
        const esEventoSuscripcion =
          evento.type === "customer.subscription.updated" ||
          evento.type === "customer.subscription.deleted";
        const subscriptionId = esEventoSuscripcion
          ? idStripe(objeto.id)
          : suscripcionDeFactura(objeto);
        if (!subscriptionId) {
          respuesta.status(200).json({ recibido: true, ignorado: true });
          return;
        }
        const subscription = esEventoSuscripcion
          ? objeto as unknown as Stripe.Subscription
          : await dependencias.stripe.subscriptions.retrieve(subscriptionId);
        const slug = metadataString(subscription.metadata, "slug");
        const cambio = estadoSegunEvento(
          evento.type,
          typeof subscription.status === "string" ? subscription.status : undefined,
        );
        if (!validarSlug(slug) || !cambio) {
          respuesta.status(200).json({ recibido: true, ignorado: true });
          return;
        }
        await sincronizarSuscripcion(
          dependencias,
          slug,
          subscriptionId,
          cambio,
        );
      }
      respuesta.status(200).json({ recibido: true });
    } catch (error: unknown) {
      registrarError("stripe.webhook.event", error);
      enviarError(respuesta, 500, "No se pudo procesar el evento de Stripe.");
    }
  };
}
