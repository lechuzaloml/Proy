import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import type { RespuestaApi } from "./contratos.js";

export interface DependenciasSuscripcion {
  auth: ReturnType<typeof getAuth>;
  firestore: ReturnType<typeof getFirestore>;
  stripe: Stripe;
  appUrl: string;
  priceId?: string;
  webhookSecret?: string;
}

function crearDependencias(): DependenciasSuscripcion {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const appUrlValue = process.env.APP_URL;
  if (!stripeSecretKey?.startsWith("sk_test_")) {
    throw new Error("La llave de Stripe no es de prueba.");
  }
  if (!accountJson || !appUrlValue) {
    throw new Error("Falta configuración del servidor.");
  }

  const appUrl = new URL(appUrlValue);
  if (
    !["http:", "https:"].includes(appUrl.protocol) ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash
  ) {
    throw new Error("APP_URL no es válida.");
  }

  const account = JSON.parse(accountJson) as Record<string, unknown>;
  const app = getApps()[0] ??
    initializeApp({ credential: cert(account as Parameters<typeof cert>[0]) });

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
    stripe: new Stripe(stripeSecretKey),
    appUrl: appUrl.origin,
    priceId: process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
}

export async function conDependencias(
  respuesta: RespuestaApi,
  ejecutar: (dependencias: DependenciasSuscripcion) => Promise<void>,
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    respuesta.status(503).json({
      error: "La suscripción solo está disponible con una llave de Stripe de prueba.",
    });
    return;
  }

  try {
    await ejecutar(crearDependencias());
  } catch (error: unknown) {
    console.error(
      "No se pudo procesar la solicitud de suscripción.",
      error instanceof Error ? error.name : "Error desconocido",
    );
    if (!respuesta.headersSent) {
      respuesta.status(503).json({
        error: "El servicio de suscripciones no está disponible.",
      });
    }
  }
}
