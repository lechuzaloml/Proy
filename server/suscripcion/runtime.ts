import type { RespuestaApi } from "./contratos.ts";

type FirebaseAuth = typeof import("firebase-admin/auth");
type FirebaseFirestore = typeof import("firebase-admin/firestore");
type StripeClient = import("stripe").default;

export interface DependenciasSuscripcion {
  auth: ReturnType<FirebaseAuth["getAuth"]>;
  firestore: ReturnType<FirebaseFirestore["getFirestore"]>;
  stripe: StripeClient;
  appUrl: string;
  priceId?: string;
  webhookSecret?: string;
}

export class ErrorApi extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "ErrorApi";
    this.statusCode = statusCode;
  }
}

interface ConfiguracionSuscripcion {
  stripeSecretKey: string;
  accountJson: string;
  appUrl: string;
  priceId?: string;
  webhookSecret?: string;
}

let dependenciasCache: Promise<
  Omit<DependenciasSuscripcion, "appUrl" | "priceId" | "webhookSecret">
> | undefined;

function exigirVariable(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) {
    throw new ErrorApi(`Falta configurar ${nombre}.`, 503);
  }
  return valor;
}

function leerConfiguracion(
  variablesRequeridas: readonly ("STRIPE_PRICE_ID" | "STRIPE_WEBHOOK_SECRET")[],
): ConfiguracionSuscripcion {
  const stripeSecretKey = exigirVariable("STRIPE_SECRET_KEY");
  if (!stripeSecretKey.startsWith("sk_test_")) {
    throw new ErrorApi(
      "La suscripción solo está disponible con una llave de Stripe de prueba.",
      503,
    );
  }

  const accountJson = exigirVariable("FIREBASE_SERVICE_ACCOUNT_JSON");
  let appUrl: URL;
  try {
    appUrl = new URL(exigirVariable("APP_URL"));
  } catch (error: unknown) {
    if (error instanceof ErrorApi) {
      throw error;
    }
    throw new ErrorApi("APP_URL debe ser una URL válida.", 503);
  }
  if (
    !["http:", "https:"].includes(appUrl.protocol) ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash
  ) {
    throw new ErrorApi("APP_URL debe ser el origen HTTP o HTTPS de la aplicación.", 503);
  }

  const configuracion: ConfiguracionSuscripcion = {
    stripeSecretKey,
    accountJson,
    appUrl: appUrl.origin,
  };
  for (const nombre of variablesRequeridas) {
    const valor = exigirVariable(nombre);
    if (nombre === "STRIPE_PRICE_ID") {
      if (!valor.startsWith("price_")) {
        throw new ErrorApi("STRIPE_PRICE_ID debe ser un ID de precio de Stripe.", 503);
      }
      configuracion.priceId = valor;
    } else {
      if (!valor.startsWith("whsec_")) {
        throw new ErrorApi(
          "STRIPE_WEBHOOK_SECRET debe ser un secreto de firma de webhook.",
          503,
        );
      }
      configuracion.webhookSecret = valor;
    }
  }
  return configuracion;
}

function mensajeSeguro(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : "Error desconocido.";
  const valoresSecretos = [
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_PRICE_ID,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.APP_URL,
  ].filter((valor): valor is string => Boolean(valor));
  const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (accountJson) {
    try {
      const cuenta: unknown = JSON.parse(accountJson);
      if (typeof cuenta === "object" && cuenta !== null) {
        for (const valor of Object.values(cuenta)) {
          if (typeof valor === "string" && valor.length >= 4) {
            valoresSecretos.push(valor);
          }
        }
      }
    } catch {
      // The invalid JSON value itself is already redacted above.
    }
  }
  let seguro = mensaje;
  for (const valor of valoresSecretos) {
    seguro = seguro.split(valor).join("[REDACTADO]");
  }
  return seguro
    .replace(/\bsk_(?:test|live)_[A-Za-z0-9_]+\b/g, "[REDACTADO]")
    .replace(/\bwhsec_[A-Za-z0-9_]+\b/g, "[REDACTADO]")
    .replace(
      /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
      "[REDACTADO]",
    );
}

export function registrarError(paso: string, error: unknown): void {
  console.error(`[${paso}] ${mensajeSeguro(error)}`);
}

async function construirClientesUnaVez(
  configuracion: ConfiguracionSuscripcion,
): Promise<
  Omit<DependenciasSuscripcion, "appUrl" | "priceId" | "webhookSecret">
> {
  if (!dependenciasCache) {
    const construccion = (async () => {
      let cuenta: Record<string, unknown>;
      try {
        cuenta = JSON.parse(configuracion.accountJson) as Record<string, unknown>;
      } catch {
        throw new ErrorApi(
          "FIREBASE_SERVICE_ACCOUNT_JSON debe contener JSON válido.",
          503,
        );
      }
      if (
        typeof cuenta.project_id !== "string" ||
        typeof cuenta.client_email !== "string" ||
        typeof cuenta.private_key !== "string"
      ) {
        throw new ErrorApi(
          "FIREBASE_SERVICE_ACCOUNT_JSON debe incluir project_id, client_email y private_key.",
          503,
        );
      }

      const [
        firebaseApp,
        firebaseAuth,
        firebaseFirestore,
        stripeModule,
      ] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("firebase-admin/firestore"),
        import("stripe"),
      ]);
      const app = firebaseApp.getApps().find(({ name }) => name === "[DEFAULT]") ??
        firebaseApp.initializeApp({
          credential: firebaseApp.cert(
            cuenta as Parameters<typeof firebaseApp.cert>[0],
          ),
        });
      return {
        auth: firebaseAuth.getAuth(app),
        firestore: firebaseFirestore.getFirestore(app),
        stripe: new stripeModule.default(configuracion.stripeSecretKey),
      };
    })();

    dependenciasCache = construccion;
    void construccion.catch(() => {
      if (dependenciasCache === construccion) {
        dependenciasCache = undefined;
      }
    });
  }

  return dependenciasCache;
}

function codigoHttp(error: unknown): number {
  if (error instanceof ErrorApi) {
    return error.statusCode;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return error.statusCode;
  }
  return 500;
}

export async function conDependencias(
  paso: string,
  variablesRequeridas: readonly ("STRIPE_PRICE_ID" | "STRIPE_WEBHOOK_SECRET")[],
  respuesta: RespuestaApi,
  ejecutar: (dependencias: DependenciasSuscripcion) => Promise<void>,
): Promise<void> {
  try {
    const configuracion = leerConfiguracion(variablesRequeridas);
    const clientes = await construirClientesUnaVez(configuracion);
    await ejecutar({
      ...clientes,
      appUrl: configuracion.appUrl,
      priceId: configuracion.priceId,
      webhookSecret: configuracion.webhookSecret,
    });
  } catch (error: unknown) {
    registrarError(paso, error);
    if (!respuesta.headersSent) {
      respuesta.status(codigoHttp(error)).json({
        error: error instanceof ErrorApi
          ? error.message
          : "No se pudo completar la solicitud.",
      });
    }
  }
}
