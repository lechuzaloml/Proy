import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebaseAuth";

interface AccesoCuentaProps {
  authListo: boolean;
  usuario: User | null;
}

export default function AccesoCuenta({
  authListo,
  usuario,
}: AccesoCuentaProps) {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const dialogoRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (usuario) {
      if (dialogo?.open) {
        dialogo.close();
      }
      setFormularioAbierto(false);
    } else if (formularioAbierto && dialogo && !dialogo.open) {
      dialogo.showModal();
    }
  }, [formularioAbierto, usuario]);

  async function prepararInicioSesion() {
    if (!auth) {
      throw new Error("Firebase no está configurado; no se puede iniciar sesión.");
    }
    setOcupado(true);
    setError("");
    await setPersistence(auth, browserLocalPersistence);
  }

  async function iniciarSesionCorreo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    try {
      await prepararInicioSesion();
      if (!auth) {
        return;
      }
      await signInWithEmailAndPassword(auth, correo.trim(), contrasena);
      setContrasena("");
    } catch (errorInicio: unknown) {
      setError(
        errorInicio instanceof Error
          ? errorInicio.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function iniciarSesionGoogle() {
    try {
      await prepararInicioSesion();
      if (!auth) {
        return;
      }
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (errorInicio: unknown) {
      setError(
        errorInicio instanceof Error
          ? errorInicio.message
          : "No se pudo iniciar sesión con Google.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function cerrarSesion() {
    if (!auth) {
      setError("Firebase no está configurado; no se puede cerrar sesión.");
      return;
    }
    setError("");
    setOcupado(true);
    try {
      await signOut(auth);
    } catch (errorCierre: unknown) {
      setError(
        errorCierre instanceof Error
          ? errorCierre.message
          : "No se pudo cerrar sesión.",
      );
    } finally {
      setOcupado(false);
    }
  }

  if (!authListo) {
    return <p className="account-status" role="status">Comprobando sesión…</p>;
  }

  if (!auth) {
    return (
      <section aria-label="Iniciar sesión" className="account-panel">
        <h2>Inicio de sesión no disponible</h2>
        <p>Configura Firebase Authentication para habilitar el acceso.</p>
      </section>
    );
  }

  if (usuario) {
    return (
      <section aria-label="Sesión de Clear-IA" className="account-panel">
        <p>
          Sesión iniciada como <strong>{usuario.email ?? "cuenta sin correo"}</strong>
        </p>
        {!usuario.emailVerified && (
          <p className="account-note" role="status">
            Verifica el correo de esta cuenta para poder usar plantillas.
          </p>
        )}
        <button
          className="secondary-button"
          disabled={ocupado}
          onClick={() => void cerrarSesion()}
          type="button"
        >
          Cerrar sesión
        </button>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section
      aria-label="Iniciar sesión"
      className="account-panel account-panel-closed"
    >
      <button
        className="secondary-button account-login-trigger"
        onClick={() => setFormularioAbierto(true)}
        type="button"
      >
        Iniciar sesión
      </button>
      <dialog
        aria-labelledby="account-login-heading"
        className="account-login-dialog"
        onCancel={() => setFormularioAbierto(false)}
        onClose={() => setFormularioAbierto(false)}
        ref={dialogoRef}
      >
        <div className="account-login-heading">
          <div>
            <p className="account-login-eyebrow">Clear-IA</p>
            <h2 id="account-login-heading">Iniciar sesión</h2>
          </div>
          <button
            aria-label="Cerrar ventana de inicio de sesión"
            className="secondary-button account-login-close"
            onClick={() => {
              dialogoRef.current?.close();
              setFormularioAbierto(false);
            }}
            type="button"
          >
            Cerrar
          </button>
        </div>
        <div className="account-login-content">
          <button
            className="secondary-button account-google-button"
            disabled={ocupado}
            onClick={() => void iniciarSesionGoogle()}
            type="button"
          >
            Continuar con Google
          </button>
          <div className="account-login-divider">
            <span>o continúa con correo y contraseña</span>
          </div>
          <form
            className="account-login-form"
            onSubmit={(evento) => void iniciarSesionCorreo(evento)}
          >
            <label>
              Correo electrónico
              <input
                autoComplete="username"
                onChange={(evento) => setCorreo(evento.target.value)}
                required
                type="email"
                value={correo}
              />
            </label>
            <label>
              Contraseña
              <input
                autoComplete="current-password"
                onChange={(evento) => setContrasena(evento.target.value)}
                required
                type="password"
                value={contrasena}
              />
            </label>
            <button className="submit-button" disabled={ocupado} type="submit">
              {ocupado ? "Procesando…" : "Iniciar sesión"}
            </button>
          </form>
          {error && <p className="admin-error" role="alert">{error}</p>}
        </div>
        <p className="account-note">
          No hay registro público. Usa una cuenta existente autorizada.
        </p>
      </dialog>
    </section>
  );
}
