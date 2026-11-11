import type { RespuestaApi } from "../suscripcion/contratos.ts";

type FirebaseAuth = typeof import("firebase-admin/auth");
type FirebaseFirestore = typeof import("firebase-admin/firestore");

export interface DependenciasCuestionarios {
  auth: ReturnType<FirebaseAuth["getAuth"]>;
  firestore: ReturnType<FirebaseFirestore["getFirestore"]>;
}

let dependenciasCache: Promise<DependenciasCuestionarios> | undefined;

function enviarError(
  respuesta: RespuestaApi,
  status: number,
  error: string,
): void {
  respuesta.status(status).json({ error });
}

async function construirDependencias(): Promise<DependenciasCuestionarios> {
  const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!accountJson) {
    throw new Error("Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON.");
  }

  let cuenta: Record<string, unknown>;
  try {
    cuenta = JSON.parse(accountJson) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON debe contener JSON válido.");
  }
  if (
    typeof cuenta.project_id !== "string" ||
    typeof cuenta.client_email !== "string" ||
    typeof cuenta.private_key !== "string"
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON debe incluir project_id, client_email y private_key.",
    );
  }

  const [firebaseApp, firebaseAuth, firebaseFirestore] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
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
  };
}

export async function conDependenciasCuestionarios(
  respuesta: RespuestaApi,
  ejecutar: (dependencias: DependenciasCuestionarios) => Promise<void>,
): Promise<void> {
  try {
    if (!dependenciasCache) {
      const construccion = construirDependencias();
      dependenciasCache = construccion;
      void construccion.catch(() => {
        if (dependenciasCache === construccion) {
          dependenciasCache = undefined;
        }
      });
    }
    await ejecutar(await dependenciasCache);
  } catch (error: unknown) {
    console.error(
      "[cuestionarios.api] No se pudieron inicializar las dependencias.",
      error instanceof Error ? error.message : "Error desconocido.",
    );
    if (!respuesta.headersSent) {
      enviarError(
        respuesta,
        503,
        "El servicio de cuestionarios no está disponible.",
      );
    }
  }
}
