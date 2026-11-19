import { useEffect, useState, type FormEvent } from "react";
import { doc, getDocFromServer } from "firebase/firestore";
import { TEXTO_AVISO_PRIVACIDAD } from "../config/privacidad";
import {
  estaVencido,
  formatearFechaEvento,
  popupDesdeDatos,
  validarRegistroEvento,
  type PopupListado,
  type RegistroEvento,
} from "../eventos/popups";
import { db } from "../lib/firebase";
import { validarCuestionario } from "../validation/validarCuestionario";
import CuestionarioPublico from "./CuestionarioPublico";
import type { DatosContacto } from "./FormularioContacto";

interface EventoEmpresaPublicoProps {
  empresaId: string;
}

interface RegistroConfirmado {
  contacto: DatosContacto;
  horario: string;
}

const REGISTRO_VACIO: RegistroEvento = {
  nombre: "",
  apellido: "",
  correo: "",
  telefono: "",
  horario: "",
  consentimientoAceptado: false,
};

function nombreEmpresa(empresaId: string): string {
  return empresaId.replace(/-/g, " ");
}

export default function EventoEmpresaPublico({
  empresaId,
}: EventoEmpresaPublicoProps) {
  const [popup, setPopup] = useState<PopupListado | null>(null);
  const [registro, setRegistro] = useState(REGISTRO_VACIO);
  const [contactoConfirmado, setContactoConfirmado] =
    useState<RegistroConfirmado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(false);
  const [imagenEventoFallida, setImagenEventoFallida] = useState(false);
  const [fotoAnfitrionFallida, setFotoAnfitrionFallida] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    async function cargarEvento() {
      if (!db || !empresaId) {
        setCargando(false);
        return;
      }
      try {
        const [empresaSnapshot, popupSnapshot] = await Promise.all([
          getDocFromServer(doc(db, "empresas", empresaId)),
          getDocFromServer(doc(db, "popups", empresaId)),
        ]);
        if (
          !empresaSnapshot.exists() ||
          empresaSnapshot.data().estado !== "activa" ||
          !popupSnapshot.exists()
        ) {
          return;
        }
        const popupCargado = popupDesdeDatos(
          empresaId,
          popupSnapshot.data(),
          typeof empresaSnapshot.data().nombre === "string"
            ? empresaSnapshot.data().nombre
            : nombreEmpresa(empresaId),
        );
        if (!popupCargado || popupCargado.estado !== "publicado") {
          return;
        }
        if (estaVencido(popupCargado)) {
          console.warn("[evento público] Evento no disponible", {
            empresaId,
            motivo: popupCargado.venceEn
              ? "el evento está vencido"
              : "no tiene fecha de vencimiento",
          });
          return;
        }

        const cuestionarioSnapshot = await getDocFromServer(doc(
          db,
          "empresas",
          empresaId,
          "cuestionarios",
          popupCargado.cuestionarioId,
        ));
        if (!cuestionarioSnapshot.exists()) {
          return;
        }
        const cuestionarioDoc = cuestionarioSnapshot.data();
        const versionId = cuestionarioDoc.versionActualId;
        if (
          cuestionarioDoc.estado !== "publicado" ||
          typeof versionId !== "string" ||
          !versionId.trim()
        ) {
          return;
        }
        const versionSnapshot = await getDocFromServer(doc(
          db,
          "empresas",
          empresaId,
          "cuestionarios",
          popupCargado.cuestionarioId,
          "versiones",
          versionId,
        ));
        if (!versionSnapshot.exists()) {
          return;
        }
        const validacion = validarCuestionario(
          versionSnapshot.data().configuracion,
        );
        if (
          !validacion.valido ||
          validacion.data.id !== popupCargado.cuestionarioId ||
          validacion.data.preguntas.length >= 60 ||
          validacion.data.preguntas.some(
            (pregunta) => pregunta.id === "horario_evento",
          )
        ) {
          return;
        }
        if (!cancelado) {
          setImagenEventoFallida(false);
          setFotoAnfitrionFallida(false);
          setPopup(popupCargado);
          setDisponible(true);
        }
      } catch (fallo: unknown) {
        if (!cancelado) {
          console.error("No se pudo cargar el evento público.", fallo);
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }
    void cargarEvento();
    return () => {
      cancelado = true;
    };
  }, [empresaId]);

  function enviarRegistro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!popup) {
      return;
    }
    const horarios = popup.horarios?.length
      ? popup.horarios
      : ["Horario por confirmar"];
    const errores = validarRegistroEvento(registro, horarios);
    if (errores.length > 0) {
      setError("Revisa tus datos, selecciona un horario y acepta el aviso de privacidad.");
      return;
    }
    setError("");
    setContactoConfirmado({
      contacto: {
        nombre: `${registro.nombre.trim()} ${registro.apellido.trim()}`,
        correo: registro.correo.trim().toLowerCase(),
        telefono: registro.telefono.trim(),
      },
      horario: registro.horario,
    });
  }

  if (cargando) {
    return (
      <main aria-busy="true" className="registro-evento">
        <p className="sr-only" role="status">Cargando evento…</p>
      </main>
    );
  }
  if (!disponible || !popup) {
    return (
      <main className="registration-unavailable" role="status">
        <h1>Evento no disponible</h1>
        <p>Este evento no está disponible en este momento.</p>
      </main>
    );
  }
  if (contactoConfirmado) {
    return (
      <CuestionarioPublico
        cuestionarioId={popup.cuestionarioId}
        datosContactoEvento={{
          contacto: contactoConfirmado.contacto,
          horario: contactoConfirmado.horario,
        }}
        empresaId={empresaId}
      />
    );
  }

  const horarios = popup.horarios?.length
    ? popup.horarios
    : ["Horario por confirmar"];

  return (
    <main className="registro-evento">
      <header className="registro-evento__hero">
        <div className="registro-evento__topbar">
          <div className="registro-evento__brand">
            {popup.empresaNombre ?? nombreEmpresa(empresaId)}
          </div>
        </div>
        <div className="registro-evento__content">
          <div className="registro-evento__copy">
            <span className="registro-evento__badge">
              {popup.insignia || "Evento"}
            </span>
            <h1>{popup.titulo}</h1>
            {popup.imagenUrl && (
              imagenEventoFallida
                ? (
                  <div
                    aria-label="Imagen no disponible"
                    className="registro-evento__event-image registro-evento__event-image-fallback popup-image-fallback"
                    role="img"
                  >
                    Imagen no disponible
                  </div>
                )
                : (
                  <img
                    alt=""
                    className="registro-evento__event-image"
                    onError={() => setImagenEventoFallida(true)}
                    src={popup.imagenUrl}
                  />
                )
            )}
            {popup.fechaEvento && (
              <p className="registro-evento__date">
                {formatearFechaEvento(popup.fechaEvento)}
              </p>
            )}
            <p>{popup.resumen}</p>
            <div className="registro-evento__schedule">
              {horarios.map((horario) => (
                <span key={horario}>{horario}</span>
              ))}
            </div>
            {popup.anfitrion && (
              <div
                aria-label={`Presenta ${popup.anfitrion.nombre}`}
                className="registro-evento__host-line"
              >
                <span className="registro-evento__host-label">Presenta</span>
                {popup.anfitrion.fotoUrl && (
                  <div className="registro-evento__host-avatar">
                    {fotoAnfitrionFallida
                      ? (
                        <span
                          aria-hidden="true"
                          className="registro-evento__host-avatar-fallback"
                        >
                          {popup.anfitrion.nombre.trim().charAt(0).toUpperCase() ||
                            "?"}
                        </span>
                      )
                      : (
                        <img
                          alt=""
                          onError={() => setFotoAnfitrionFallida(true)}
                          src={popup.anfitrion.fotoUrl}
                        />
                      )}
                  </div>
                )}
                <strong>{popup.anfitrion.nombre}</strong>
              </div>
            )}
          </div>
          <aside className="registro-evento__card" id="registro-evento-formulario">
            <div className="registro-evento__card-header">
              <h2>Regístrate para continuar</h2>
              <p>Completa tus datos y responde el cuestionario del evento.</p>
            </div>
            <form
              aria-label="Formulario de registro al evento"
              className="registro-evento__form"
              onSubmit={enviarRegistro}
            >
              <div className="registro-evento__row">
                <label className="registro-evento__field">
                  <span>Nombre</span>
                  <input
                    autoComplete="given-name"
                    maxLength={120}
                    onChange={(evento) =>
                      setRegistro((actual) => ({
                        ...actual,
                        nombre: evento.target.value,
                      }))}
                    required
                    value={registro.nombre}
                  />
                </label>
                <label className="registro-evento__field">
                  <span>Apellido</span>
                  <input
                    autoComplete="family-name"
                    maxLength={120}
                    onChange={(evento) =>
                      setRegistro((actual) => ({
                        ...actual,
                        apellido: evento.target.value,
                      }))}
                    required
                    value={registro.apellido}
                  />
                </label>
              </div>
              <label className="registro-evento__field">
                <span>Correo electrónico</span>
                <input
                  autoComplete="email"
                  maxLength={200}
                  onChange={(evento) =>
                    setRegistro((actual) => ({
                      ...actual,
                      correo: evento.target.value,
                    }))}
                  required
                  type="email"
                  value={registro.correo}
                />
              </label>
              <label className="registro-evento__field">
                <span>Teléfono</span>
                <input
                  autoComplete="tel"
                  maxLength={30}
                  minLength={5}
                  onChange={(evento) =>
                    setRegistro((actual) => ({
                      ...actual,
                      telefono: evento.target.value,
                    }))}
                  required
                  type="tel"
                  value={registro.telefono}
                />
              </label>
              <label className="registro-evento__field">
                <span>Horario</span>
                <select
                  onChange={(evento) =>
                    setRegistro((actual) => ({
                      ...actual,
                      horario: evento.target.value,
                    }))}
                  required
                  value={registro.horario}
                >
                  <option disabled value="">Selecciona un horario</option>
                  {horarios.map((horario) => (
                    <option key={horario} value={horario}>{horario}</option>
                  ))}
                </select>
              </label>
              <div className="privacy-consent event-privacy-consent">
                <details>
                  <summary>Leer aviso de privacidad</summary>
                  <p>{TEXTO_AVISO_PRIVACIDAD}</p>
                </details>
                <label>
                  <input
                    checked={registro.consentimientoAceptado}
                    onChange={(evento) =>
                      setRegistro((actual) => ({
                        ...actual,
                        consentimientoAceptado: evento.target.checked,
                      }))}
                    required
                    type="checkbox"
                  />
                  <span>
                    He leído el aviso y consiento el uso de mis datos para los
                    fines descritos.
                  </span>
                </label>
              </div>
              {error && (
                <p aria-live="polite" className="registro-evento__error">
                  {error}
                </p>
              )}
              <button className="registro-evento__button" type="submit">
                Continuar al cuestionario
              </button>
            </form>
          </aside>
        </div>
      </header>
      {popup.puntos && popup.puntos.length > 0 && (
        <section className="registro-evento__learn">
          <div className="registro-evento__learn-shell">
            <span className="registro-evento__learn-label">
              Sobre el evento
            </span>
            <h2>Lo que encontrarás</h2>
            <p>{popup.resumen}</p>
            <ol className="registro-evento__learn-list">
              {popup.puntos.map((punto, indice) => (
                <li key={`${punto.titulo}-${indice}`}>
                  <span className="registro-evento__learn-number">
                    {String(indice + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{punto.titulo}</h3>
                    <p>{punto.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      <footer className="registro-evento__footer">
        <div className="registro-evento__footer-brand">
          {popup.empresaNombre ?? nombreEmpresa(empresaId)}
        </div>
        <div className="registro-evento__footer-copy">
          Información del evento publicada por la empresa.
        </div>
      </footer>
    </main>
  );
}
