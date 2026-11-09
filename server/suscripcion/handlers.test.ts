import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { RespuestaApi, SolicitudApi } from "./contratos.ts";
import {
  crearHandlerEstado,
  crearHandlerIniciar,
  crearHandlerPortal,
  crearHandlerWebhook,
  decidirCheckout,
  estadoSegunEvento,
  validarSlug,
} from "./handlers.ts";
import type { DependenciasSuscripcion } from "./runtime.ts";
import { conDependencias } from "./runtime.ts";

class FirestoreSimulado {
  documentos = new Map<string, Record<string, unknown>>();

  doc(path: string) {
    return { path, get: () => this.get(path) };
  }

  async runTransaction<T>(
    actualizar: (transaccion: {
      get: (referencia: { path: string }) => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: (
        referencia: { path: string },
        datos: Record<string, unknown>,
        opciones?: { merge: boolean },
      ) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const escrituras: {
      path: string;
      datos: Record<string, unknown>;
      merge: boolean;
    }[] = [];
    const resultado = await actualizar({
      get: async ({ path }) => ({
        exists: this.documentos.has(path),
        data: () => this.documentos.get(path),
      }),
      set: (referencia, datos, opciones) => {
        escrituras.push({
          path: referencia.path,
          datos,
          merge: opciones?.merge === true,
        });
      },
    });
    for (const escritura of escrituras) {
      const datosPrevios = this.documentos.get(escritura.path);
      this.documentos.set(
        escritura.path,
        escritura.merge && datosPrevios
          ? { ...datosPrevios, ...escritura.datos }
          : escritura.datos,
      );
    }
    return resultado;
  }

  async get(path: string) {
    const data = this.documentos.get(path);
    return { exists: data !== undefined, data: () => data };
  }
}

class RespuestaSimulada implements RespuestaApi {
  codigo = 200;
  body: unknown;

  status(code: number): RespuestaApi {
    this.codigo = code;
    return this;
  }

  json(body: unknown): void {
    this.body = body;
  }
}

function solicitud(body: unknown, headers: SolicitudApi["headers"] = {}) {
  return Object.assign(Readable.from([]), {
    method: "POST",
    headers: { authorization: "Bearer token", ...headers },
    body,
  }) as SolicitudApi;
}

function crearDependencias(
  firestore = new FirestoreSimulado(),
  sobreescrituras: Record<string, unknown> = {},
): { dependencias: DependenciasSuscripcion; firestore: FirestoreSimulado } {
  const stripe = {
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.test/session" }) },
    },
    billingPortal: {
      sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.test/session" }) },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_test",
        trial_end: 1_800_000_000,
        status: "trialing",
        metadata: { slug: "empresa-a" },
      }),
      cancel: vi.fn().mockResolvedValue({ id: "sub_test" }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  const dependencias = {
    auth: {
      verifyIdToken: vi.fn().mockResolvedValue({
        email: "duena@example.com",
        email_verified: true,
      }),
    },
    firestore,
    stripe,
    appUrl: "https://app.example",
    priceId: "price_test",
    webhookSecret: "whsec_test",
    ...sobreescrituras,
  } as unknown as DependenciasSuscripcion;
  return { dependencias, firestore };
}

describe("funciones puras de suscripción", () => {
  it("valida slugs y rechaza reservados", () => {
    expect(validarSlug("empresa-a")).toBe(true);
    expect(validarSlug("admin")).toBe(false);
    expect(validarSlug("A-empresa")).toBe(false);
    expect(validarSlug("ab")).toBe(false);
  });

  it("decide los estados según el evento de Stripe", () => {
    expect(estadoSegunEvento("invoice.paid")).toEqual({
      estadoSuscripcion: "activa",
      estadoEmpresa: "activa",
    });
    expect(estadoSegunEvento("invoice.payment_failed")?.estadoSuscripcion)
      .toBe("pago_pendiente");
    expect(
      estadoSegunEvento("customer.subscription.updated", "unpaid"),
    ).toEqual({
      estadoSuscripcion: "cancelada",
      estadoEmpresa: "suspendida",
    });
    expect(
      estadoSegunEvento("customer.subscription.updated", "trialing")
        ?.estadoSuscripcion,
    ).toBe("prueba");
  });

  it("distingue creación, reintento idempotente y conflicto de Checkout", () => {
    expect(decidirCheckout({
      empresaExiste: false,
      suscripcionCoincide: false,
      miembroExiste: false,
      pruebaExiste: false,
      slugPruebaCoincide: false,
    })).toBe("crear");
    expect(decidirCheckout({
      empresaExiste: true,
      suscripcionCoincide: true,
      miembroExiste: true,
      pruebaExiste: true,
      slugPruebaCoincide: true,
    })).toBe("duplicado");
    expect(decidirCheckout({
      empresaExiste: true,
      suscripcionCoincide: false,
      miembroExiste: true,
      pruebaExiste: true,
      slugPruebaCoincide: false,
    })).toBe("cancelar");
  });
});

describe("endpoints de suscripción con Stripe y Firebase simulados", () => {
  it("verifica token y crea Checkout sin escribir una empresa", async () => {
    const { dependencias, firestore } = crearDependencias();
    const respuesta = new RespuestaSimulada();
    const crearSesion = vi.mocked(
      (dependencias.stripe as unknown as {
        checkout: { sessions: { create: (args: unknown) => Promise<unknown> } };
      }).checkout.sessions.create,
    );

    await crearHandlerIniciar(dependencias)(
      solicitud({ slug: "empresa-a", nombre: "Empresa A" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ url: "https://checkout.test/session" });
    expect(crearSesion).toHaveBeenCalledWith(expect.objectContaining({
      mode: "subscription",
      customer_email: "duena@example.com",
      client_reference_id: "empresa-a",
      subscription_data: expect.objectContaining({ trial_period_days: 7 }),
    }));
    expect(firestore.documentos.size).toBe(0);
  });

  it("rechaza el inicio si el correo no está verificado", async () => {
    const { dependencias } = crearDependencias(undefined, {
      auth: {
        verifyIdToken: vi.fn().mockResolvedValue({
          email: "duena@example.com",
          email_verified: false,
        }),
      },
    });
    const respuesta = new RespuestaSimulada();

    await crearHandlerIniciar(dependencias)(
      solicitud({ slug: "empresa-a", nombre: "Empresa A" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
  });

  it("crea la empresa, la membresía, la suscripción privada y la prueba una sola vez", async () => {
    const { dependencias, firestore } = crearDependencias();
    const evento = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "empresa-a",
          metadata: {
            slug: "empresa-a",
            nombre: "Empresa A",
            correo: "duena@example.com",
          },
          customer: "cus_test",
          subscription: "sub_test",
        },
      },
    };
    const construirEvento = (dependencias.stripe as unknown as {
      webhooks: { constructEvent: ReturnType<typeof vi.fn> };
    }).webhooks.constructEvent;
    construirEvento.mockReturnValue(evento);
    const handler = crearHandlerWebhook(dependencias);

    for (let intento = 0; intento < 2; intento += 1) {
      const respuesta = new RespuestaSimulada();
      await handler(solicitud(undefined, { "stripe-signature": "firma-test" }), respuesta);
      expect(respuesta.codigo).toBe(200);
    }

    expect(firestore.documentos.get("empresas/empresa-a")).toEqual(
      expect.objectContaining({ nombre: "Empresa A", estado: "activa", planId: "prueba" }),
    );
    expect(firestore.documentos.get("empresas/empresa-a/miembros/duena@example.com"))
      .toEqual(expect.objectContaining({
        correo: "duena@example.com",
        rol: "propietario",
        estado: "activo",
      }));
    expect(firestore.documentos.get("empresas/empresa-a/suscripcion/actual"))
      .toEqual(expect.objectContaining({
        estado: "prueba",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        precio: "1 USD/mes",
      }));
    expect(firestore.documentos.get("pruebas/duena@example.com"))
      .toEqual(expect.objectContaining({ slug: "empresa-a" }));
    expect(firestore.documentos.size).toBe(4);
    expect(
      (dependencias.stripe as unknown as {
        subscriptions: { cancel: ReturnType<typeof vi.fn> };
      }).subscriptions.cancel,
    ).not.toHaveBeenCalled();
  });

  it("rechaza el inicio si el correo ya usó la prueba", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("pruebas/duena@example.com", { slug: "anterior" });
    const respuesta = new RespuestaSimulada();

    await crearHandlerIniciar(dependencias)(
      solicitud({ slug: "empresa-a", nombre: "Empresa A" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(409);
    expect(firestore.documentos.has("empresas/empresa-a")).toBe(false);
    expect(
      (dependencias.stripe as unknown as {
        checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
      }).checkout.sessions.create,
    ).not.toHaveBeenCalled();
  });

  it("cancela el Checkout completado cuando el correo ya tiene una prueba", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("pruebas/duena@example.com", {
      slug: "otra-empresa",
    });
    (dependencias.stripe as unknown as {
      webhooks: { constructEvent: ReturnType<typeof vi.fn> };
    }).webhooks.constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "empresa-a",
          metadata: {
            slug: "empresa-a",
            nombre: "Empresa A",
            correo: "duena@example.com",
          },
          customer: "cus_test",
          subscription: "sub_test",
        },
      },
    });
    const respuesta = new RespuestaSimulada();

    await crearHandlerWebhook(dependencias)(
      solicitud(undefined, { "stripe-signature": "firma-test" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(
      (dependencias.stripe as unknown as {
        subscriptions: { cancel: ReturnType<typeof vi.fn> };
      }).subscriptions.cancel,
    ).toHaveBeenCalledWith("sub_test");
    expect(firestore.documentos.has("empresas/empresa-a")).toBe(false);
  });

  it("sincroniza invoice.paid y la cancelación de suscripción con Firestore", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "activa" });
    firestore.documentos.set("empresas/empresa-a/suscripcion/actual", {
      estado: "prueba",
      stripeSubscriptionId: "sub_test",
    });
    const construirEvento = (dependencias.stripe as unknown as {
      webhooks: { constructEvent: ReturnType<typeof vi.fn> };
    }).webhooks.constructEvent;

    construirEvento.mockReturnValue({
      id: "evt_paid",
      type: "invoice.paid",
      data: { object: { subscription: "sub_test" } },
    });
    let respuesta = new RespuestaSimulada();
    await crearHandlerWebhook(dependencias)(
      solicitud(undefined, { "stripe-signature": "firma-test" }),
      respuesta,
    );
    expect(firestore.documentos.get("empresas/empresa-a/suscripcion/actual"))
      .toEqual(expect.objectContaining({ estado: "activa" }));

    construirEvento.mockReturnValue({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test",
          status: "canceled",
          metadata: { slug: "empresa-a" },
        },
      },
    });
    respuesta = new RespuestaSimulada();
    await crearHandlerWebhook(dependencias)(
      solicitud(undefined, { "stripe-signature": "firma-test" }),
      respuesta,
    );
    expect(firestore.documentos.get("empresas/empresa-a/suscripcion/actual"))
      .toEqual(expect.objectContaining({ estado: "cancelada" }));
    expect(firestore.documentos.get("empresas/empresa-a"))
      .toEqual(expect.objectContaining({ estado: "suspendida" }));
  });

  it("crea el portal solo para el propietario/admin y el estado de respaldo no revela IDs", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a/miembros/duena@example.com", {
      correo: "duena@example.com",
      rol: "propietario",
      estado: "activo",
    });
    firestore.documentos.set("empresas/empresa-a/suscripcion/actual", {
      estado: "prueba",
      pruebaHasta: new Date("2027-01-01T00:00:00.000Z"),
      stripeCustomerId: "cus_private",
      stripeSubscriptionId: "sub_private",
    });

    const portalRespuesta = new RespuestaSimulada();
    await crearHandlerPortal(dependencias)(
      solicitud({ slug: "empresa-a" }),
      portalRespuesta,
    );
    expect(portalRespuesta.body).toEqual({ url: "https://portal.test/session" });

    const estadoRespuesta = new RespuestaSimulada();
    await crearHandlerEstado(dependencias)(
      solicitud({ slug: "empresa-a" }),
      estadoRespuesta,
    );
    expect(estadoRespuesta.body).toEqual({
      suscripcion: {
        estado: "prueba",
        pruebaHasta: "2027-01-01T00:00:00.000Z",
      },
    });
    expect(JSON.stringify(estadoRespuesta.body)).not.toContain("cus_private");
    expect(JSON.stringify(estadoRespuesta.body)).not.toContain("sub_private");
  });

  it("bloquea toda ruta protegida cuando la llave no es de prueba", async () => {
    const claveAnterior = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_live_no-real";
    const ejecutar = vi.fn();
    const respuesta = new RespuestaSimulada();
    try {
      await conDependencias(
        "suscripcion.iniciar",
        [],
        respuesta,
        ejecutar,
      );
    } finally {
      if (claveAnterior === undefined) {
        delete process.env.STRIPE_SECRET_KEY;
      } else {
        process.env.STRIPE_SECRET_KEY = claveAnterior;
      }
    }

    expect(respuesta.codigo).toBe(503);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("nombra la variable faltante y devuelve JSON sin registrar valores", async () => {
    const nombres = [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_ID",
      "STRIPE_WEBHOOK_SECRET",
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      "APP_URL",
    ] as const;
    const valoresPrevios = new Map(
      nombres.map((nombre) => [nombre, process.env[nombre]]),
    );
    const clave = "sk_test_no_debe_aparecer";
    process.env.STRIPE_SECRET_KEY = clave;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.APP_URL;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const respuesta = new RespuestaSimulada();
    try {
      await conDependencias(
        "suscripcion.iniciar",
        ["STRIPE_PRICE_ID"],
        respuesta,
        vi.fn(),
      );
      expect(log).toHaveBeenCalledWith(
        "[suscripcion.iniciar] Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON.",
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(clave);
    } finally {
      log.mockRestore();
      for (const nombre of nombres) {
        const valor = valoresPrevios.get(nombre);
        if (valor === undefined) {
          delete process.env[nombre];
        } else {
          process.env[nombre] = valor;
        }
      }
    }

    expect(respuesta.codigo).toBe(503);
    expect(respuesta.body).toEqual({
      error: "Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON.",
    });
  });
});
