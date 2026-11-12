import { useEffect, useState, type FormEvent } from "react";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { DIAS_PRUEBA, PRECIO, PRECIO_PROVISIONAL } from "../config/suscripcion";
import {
  limiteDePlan,
  PLANES_SUSCRIPCION,
  type PlanSuscripcionId,
} from "../config/planes";
import { CUESTIONARIO_ID } from "../config/firebaseDatos";
import { CLAVE_EMPRESA_ACTIVA } from "../config/empresaActiva";
import { auth } from "../lib/firebaseAuth";
import { db } from "../lib/firebase";

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

function campoString(
  valor: unknown,
  clave: string,
): string | null {
  if (typeof valor !== "object" || valor === null || !(clave in valor)) {
    return null;
  }
  const campo = (valor as Record<string, unknown>)[clave];
  return typeof campo === "string" ? campo : null;
}

export function resolverPlanInicial(search: string): {
  planId: PlanSuscripcionId;
  mostrarSelector: boolean;
} {
  const planId = new URLSearchParams(search).get("plan");
  const planValido = PLANES_SUSCRIPCION.find((plan) => plan.id === planId);
  return {
    planId: planValido?.id ?? "pro",
    mostrarSelector: !planValido,
  };
}

export function crearCuerpoSolicitudInicio(
  slug: string,
  nombre: string,
  planId: PlanSuscripcionId,
): string {
  return JSON.stringify({ slug, nombre, planId });
}

export default function PantallaSuscripcion() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [authListo, setAuthListo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [estadoPlanInicial] = useState(() =>
    resolverPlanInicial(window.location.search),
  );
  const [planId, setPlanId] = useState<PlanSuscripcionId>(
    estadoPlanInicial.planId,
  );
  const [mostrarSelector, setMostrarSelector] = useState(
    estadoPlanInicial.mostrarSelector,
  );
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [intentoPreparar, setIntentoPreparar] = useState(0);
  const [esperaTerminada, setEsperaTerminada] = useState(false);
  const [errorPreparacion, setErrorPreparacion] = useState("");
  const parametros = new URLSearchParams(window.location.search);
  const retornoExitoso = parametros.get("checkout") === "success";
  const retornoCancelado = parametros.get("checkout") === "cancelled";
  const slugRetorno = parametros.get("slug") ?? "";
  const slugValido = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) &&
    !["admin", "e", "api", "assets", "static", "login", "clearia"].includes(slug);
  const urlPublica = slugValido
    ? `${window.location.origin}/c/${slug}/${CUESTIONARIO_ID}`
    : "";

  useEffect(() => {
    if (!auth) {
      setAuthListo(true);
      return;
    }
    return onAuthStateChanged(
      auth,
      (siguienteUsuario) => {
        setUsuario(siguienteUsuario);
        setAuthListo(true);
      },
      (errorAuth) => {
        console.error("No se pudo verificar la sesión de suscripción.", errorAuth.name);
        setError("No se pudo comprobar la sesión. Recarga la página para intentarlo de nuevo.");
        setAuthListo(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!retornoExitoso || !slugRetorno || !authListo) {
      return;
    }
    if (!usuario) {
      setErrorPreparacion("");
      setEsperaTerminada(false);
      return;
    }
    if (!usuario.email || !usuario.emailVerified) {
      setErrorPreparacion("Inicia sesión con el correo verificado que usaste al comenzar Checkout.");
      setEsperaTerminada(true);
      return;
    }
    const database = db;
    if (!database) {
      setErrorPreparacion("Firebase no está configurado. No se puede verificar la membresía.");
      setEsperaTerminada(true);
      return;
    }
    const correo = usuario.email.toLowerCase();

    let cancelado = false;
    let temporizador = 0;
    const limite = Date.now() + 30_000;
    setEsperaTerminada(false);
    setErrorPreparacion("");

    async function comprobarMembresia(): Promise<void> {
      try {
        if (!database) {
          throw new Error("Firebase no está configurado.");
        }
        const membresia = await getDoc(doc(
          database,
          "empresas",
          slugRetorno,
          "miembros",
          correo,
        ));
        if (cancelado) {
          return;
        }
        if (membresia.exists() && membresia.data().estado === "activo") {
          window.localStorage.setItem(CLAVE_EMPRESA_ACTIVA, slugRetorno);
          window.location.assign(
            `/admin?empresa=${encodeURIComponent(slugRetorno)}`,
          );
          return;
        }
      } catch (errorLectura: unknown) {
        if (!cancelado) {
          setErrorPreparacion(
            `No se pudo comprobar la membresía: ${mensajeDeError(errorLectura)}`,
          );
          setEsperaTerminada(true);
        }
        return;
      }

      if (cancelado) {
        return;
      }
      if (Date.now() >= limite) {
        setErrorPreparacion(
          "La confirmación está tardando más de lo esperado. Puedes volver a consultar en unos momentos.",
        );
        setEsperaTerminada(true);
        return;
      }
      temporizador = window.setTimeout(() => void comprobarMembresia(), 1_000);
    }

    void comprobarMembresia();
    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
    };
  }, [authListo, intentoPreparar, retornoExitoso, slugRetorno, usuario]);

  async function iniciarSesionGoogle(): Promise<void> {
    if (!auth) {
      setError("Firebase Authentication no está configurado.");
      return;
    }
    setProcesando(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (errorInicio: unknown) {
      setError(mensajeDeError(errorInicio));
    } finally {
      setProcesando(false);
    }
  }

  async function iniciarPrueba(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!usuario) {
      setError("Inicia sesión con Google para continuar.");
      return;
    }
    if (!usuario.emailVerified) {
      setError("Verifica el correo de tu cuenta de Google para continuar.");
      return;
    }
    setProcesando(true);
    setError("");
    try {
      const token = await usuario.getIdToken();
      const respuesta = await fetch("/api/suscripcion/iniciar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: crearCuerpoSolicitudInicio(slug, nombre, planId),
      });
      const datos: unknown = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(
          campoString(datos, "error") ?? "No se pudo iniciar Checkout.",
        );
      }
      const url = campoString(datos, "url");
      if (!url) {
        throw new Error("El servidor no devolvió la dirección de Checkout.");
      }
      window.location.assign(url);
    } catch (errorInicio: unknown) {
      setError(mensajeDeError(errorInicio));
    } finally {
      setProcesando(false);
    }
  }

  if (retornoExitoso) {
    return (
      <main className="suscripcion-page">
        <header className="landing-brand">
          <span>CLEAR-IA</span>
        </header>
        <section aria-labelledby="suscripcion-title" className="suscripcion-card">
          <p className="suscripcion-mode">
            Modo de prueba: no se cobra dinero real
          </p>
          <h1 id="suscripcion-title">Preparando tu empresa...</h1>
          {!authListo ? (
            <p role="status">Comprobando tu sesión...</p>
          ) : !usuario ? (
            <>
              <p>Inicia sesión con Google para comprobar la membresía de tu empresa.</p>
              <button
                className="submit-button"
                disabled={procesando}
                onClick={() => void iniciarSesionGoogle()}
                type="button"
              >
                {procesando ? "Conectando..." : "Continuar con Google"}
              </button>
            </>
          ) : (
            <>
              {!esperaTerminada && (
                <p role="status">
                  Confirmando el registro de la empresa. Esta página puede tardar unos segundos.
                </p>
              )}
              {errorPreparacion && (
                <p className="admin-error" role="alert">{errorPreparacion}</p>
              )}
              {esperaTerminada && (
                <button
                  className="submit-button"
                  onClick={() => {
                    setErrorPreparacion("");
                    setIntentoPreparar((actual) => actual + 1);
                  }}
                  type="button"
                >
                  Reintentar
                </button>
              )}
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="suscripcion-page">
      <header className="landing-brand">
        <span>CLEAR-IA</span>
      </header>
      <section aria-labelledby="suscripcion-title" className="suscripcion-card">
        <p className="landing-kicker">Suscripción</p>
        <h1 id="suscripcion-title">Probar gratis 7 días</h1>
        <p className="suscripcion-mode">
          Modo de prueba: 1 USD. Los valores son provisionales.
        </p>
        <p className="suscripcion-resumen">
          {DIAS_PRUEBA} días de prueba; después {PRECIO}
          {PRECIO_PROVISIONAL ? " (precio provisional)" : ""}
        </p>

        {!authListo ? (
          <p role="status">Comprobando sesión...</p>
        ) : usuario ? (
          <div className="suscripcion-cuenta">
            <p>
              Sesión iniciada como <strong>{usuario.email}</strong>
            </p>
            {!usuario.emailVerified && (
              <p className="admin-error" role="alert">
                Verifica el correo de tu cuenta de Google para continuar.
              </p>
            )}
          </div>
        ) : (
          <button
            className="secondary-button suscripcion-google"
            disabled={procesando}
            onClick={() => void iniciarSesionGoogle()}
            type="button"
          >
            {procesando ? "Conectando..." : "Iniciar sesión con Google"}
          </button>
        )}

        {retornoCancelado && (
          <p className="suscripcion-cancelada" role="status">
            Cancelaste el proceso de Checkout. No se creó ninguna empresa.
          </p>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}

        {mostrarSelector ? (
          <fieldset className="suscripcion-planes">
            <legend>Elige tu plan</legend>
            {PLANES_SUSCRIPCION.map((plan) => (
              <label key={plan.id}>
                <input
                  checked={planId === plan.id}
                  name="planId"
                  onChange={() => {
                    setPlanId(plan.id);
                    setMostrarSelector(false);
                  }}
                  type="radio"
                  value={plan.id}
                />
                {plan.nombre}: hasta {limiteDePlan(plan.id)} cuestionarios
                publicados por empresa
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="suscripcion-plan-elegido">
            <p>
              Plan elegido:{" "}
              <strong>
                {PLANES_SUSCRIPCION.find((plan) => plan.id === planId)?.nombre}
              </strong>{" "}
              - hasta {limiteDePlan(planId)} cuestionarios publicados
            </p>
            <button
              className="secondary-button"
              onClick={() => setMostrarSelector(true)}
              type="button"
            >
              Cambiar plan
            </button>
          </div>
        )}

        <form className="suscripcion-form" onSubmit={(evento) => void iniciarPrueba(evento)}>
          <label>
            Nombre de la empresa
            <input
              maxLength={80}
              onChange={(evento) => setNombre(evento.target.value)}
              required
              value={nombre}
            />
          </label>
          <label>
            Identificador de la empresa
            <input
              autoCapitalize="none"
              maxLength={40}
              onChange={(evento) =>
                setSlug(evento.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
              required
              value={slug}
            />
          </label>
          <p className="suscripcion-preview">
            Dirección pública:{" "}
            {urlPublica || `${window.location.origin}/c/tu-identificador/${CUESTIONARIO_ID}`}
          </p>
          <button
            className="submit-button"
            disabled={procesando || !usuario || !usuario.emailVerified}
            type="submit"
          >
            {procesando ? "Conectando con Stripe..." : "Continuar a Stripe Checkout"}
          </button>
        </form>
      </section>
    </main>
  );
}
