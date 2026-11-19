import { useEffect, useState, type FormEvent } from "react";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  DIAS_GRACIA,
  MAX_DIAS_EVENTO_FIRESTORE,
} from "../config/popups";
import {
  crearDocumentoPopup,
  diagnosticarPopup,
  estaVencido,
  formatearFechaEvento,
  limpiarCamposOpcionalesPopup,
  obtenerFechaFormulario,
  obtenerHoraFormulario,
  obtenerEstadoTrasEdicion,
  popupDesdeDatos,
  transicionarPopup,
  validarFormularioEvento,
  type EstadoPopup,
  type FormularioPopup,
  type PopupEvento,
} from "../eventos/popups";

const FORMULARIO_VACIO: FormularioPopup = {
  titulo: "",
  insignia: "",
  resumen: "",
  imagenUrl: "",
  fecha: "",
  hora: "",
  horarios: [""],
  anfitrionNombre: "",
  anfitrionFotoUrl: "",
  puntos: [{ titulo: "", texto: "" }],
  cuestionarioId: "",
};

interface PanelMiEventoProps {
  empresaId: string;
  empresaNombre: string;
  rol: "admin" | "propietario";
  estadoMiembro: "activo" | "inactivo" | null;
  sesionVerificada: boolean;
  empresaActiva: boolean;
}

function estadoLegible(estado: EstadoPopup): string {
  return {
    borrador: "Borrador",
    pendiente: "Pendiente de revisión",
    publicado: "Publicado",
    rechazado: "Rechazado",
  }[estado];
}

function tipoCampoEnviado(valor: unknown): string {
  if (valor instanceof Timestamp) {
    return "timestamp";
  }
  if (Array.isArray(valor)) {
    return "lista";
  }
  if (valor === null) {
    return "nulo";
  }
  if (typeof valor === "object") {
    return "mapa";
  }
  return typeof valor;
}

function esRechazoPorPermisos(fallo: unknown): boolean {
  return typeof fallo === "object" &&
    fallo !== null &&
    "code" in fallo &&
    fallo.code === "permission-denied";
}

export default function PanelMiEvento({
  empresaId,
  empresaNombre,
  rol,
  estadoMiembro,
  sesionVerificada,
  empresaActiva,
}: PanelMiEventoProps) {
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [popup, setPopup] = useState<PopupEvento | null>(null);
  const [cuestionarios, setCuestionarios] = useState<
    { id: string; nombre: string }[]
  >([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modificado, setModificado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!db) {
        setError("Firebase no está configurado.");
        setCargando(false);
        return;
      }
      setCargando(true);
      setError("");
      try {
        const [popupSnapshot, cuestionariosSnapshot] = await Promise.all([
          getDoc(doc(db, "popups", empresaId)),
          getDocs(query(
            collection(db, "empresas", empresaId, "cuestionarios"),
            where("estado", "==", "publicado"),
          )),
        ]);
        if (cancelado) {
          return;
        }
        const documento = popupSnapshot.exists()
          ? popupDesdeDatos(empresaId, popupSnapshot.data())
          : null;
        if (documento) {
          const datosPopup: PopupEvento = documento;
          setPopup(datosPopup);
          setFormulario({
            titulo: datosPopup.titulo,
            insignia: datosPopup.insignia ?? "",
            resumen: datosPopup.resumen,
            imagenUrl: datosPopup.imagenUrl ?? "",
            fecha: obtenerFechaFormulario(datosPopup.fechaEvento),
            hora: obtenerHoraFormulario(datosPopup.fechaEvento),
            horarios: datosPopup.horarios?.length
              ? datosPopup.horarios
              : [""],
            anfitrionNombre: datosPopup.anfitrion?.nombre ?? "",
            anfitrionFotoUrl: datosPopup.anfitrion?.fotoUrl ?? "",
            puntos: datosPopup.puntos?.length
              ? datosPopup.puntos
              : [{ titulo: "", texto: "" }],
            cuestionarioId: datosPopup.cuestionarioId,
          });
        }
        setCuestionarios(cuestionariosSnapshot.docs.map((snapshot) => ({
          id: snapshot.id,
          nombre: typeof snapshot.data().nombre === "string"
            ? snapshot.data().nombre
            : snapshot.id,
        })));
      } catch (fallo: unknown) {
        if (!cancelado) {
          setError(
            fallo instanceof Error
              ? `No se pudo cargar el evento: ${fallo.message}`
              : "No se pudo cargar el evento.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [empresaId]);

  function cambiar(cambios: Partial<FormularioPopup>) {
    setFormulario((actual) => ({ ...actual, ...cambios }));
    setModificado(true);
  }

  async function guardar(
    accion: "guardar-borrador" | "enviar-revision" | "volver-borrador",
  ) {
    if (guardando) {
      return;
    }
    if (!db) {
      setError("Firebase no está configurado.");
      return;
    }
    const estado = popup?.estado === "publicado" &&
        accion === "guardar-borrador"
      ? obtenerEstadoTrasEdicion(popup.estado)
      : transicionarPopup(rol, popup?.estado ?? null, accion);
    if (!estado) {
      setError("No se permite esta transición de estado.");
      return;
    }

    const ahora = new Date();
    const datos = limpiarCamposOpcionalesPopup({
      ...crearDocumentoPopup(formulario, "borrador"),
      estado,
    });
    const payload = {
      ...datos,
      actualizadoEn: serverTimestamp(),
    };
    const erroresDiagnostico = diagnosticarPopup(payload, {
      rol,
      estadoMiembro,
      sesionVerificada,
      empresaActiva,
      cuestionarioPublicado: cuestionarios.some(
        ({ id }) => id === formulario.cuestionarioId,
      ),
      ahora,
      actualizadoEnEsServerTimestamp: true,
    });
    if (erroresDiagnostico.length) {
      setError(`No se puede guardar el evento: ${erroresDiagnostico.join(" ")}`);
      return;
    }

    const requiereFechaEvento = accion === "enviar-revision" ||
      (popup?.estado === "publicado" && accion === "guardar-borrador");
    const erroresFormulario = validarFormularioEvento(
      formulario,
      ahora,
      requiereFechaEvento,
    );
    if (erroresFormulario.length) {
      const mensajes: Record<string, string> = {
        titulo: "El título es obligatorio y admite hasta 80 caracteres.",
        resumen: "El resumen es obligatorio y admite hasta 300 caracteres.",
        cuestionarioId: "Selecciona un cuestionario publicado.",
        longitud: "La insignia admite hasta 60 caracteres.",
        fechaEvento: "La fecha y hora deben ser válidas, no anteriores a hoy y respetar el límite de 400 días.",
        horarios: "Los horarios admiten hasta 4 elementos válidos.",
        puntos: "Los puntos admiten hasta 4 elementos completos.",
        imagenUrl: "Las imágenes deben usar una URL HTTPS válida.",
        anfitrionNombre: "El nombre del anfitrión es obligatorio y admite hasta 80 caracteres.",
      };
      setError(erroresFormulario.map((clave) => mensajes[clave]).join(" "));
      return;
    }

    setGuardando(true);
    setError("");
    try {
      console.warn(
        "[Mi evento] Campos enviados a Firestore",
        Object.entries(payload).map(([campo, valor]) => ({
          campo,
          tipo: campo === "actualizadoEn"
            ? "serverTimestamp"
            : tipoCampoEnviado(valor),
        })),
      );
      await setDoc(doc(db, "popups", empresaId), payload);
      setPopup(datos);
      setModificado(false);
    } catch (fallo: unknown) {
      console.error("[Mi evento] Falló el guardado del evento.", {
        tipo: fallo instanceof Error ? fallo.name : typeof fallo,
      });
      setError(esRechazoPorPermisos(fallo)
        ? "Firestore rechazó el guardado. Verifica que las reglas publicadas sean las más recientes."
        : fallo instanceof Error
        ? `No se pudo guardar el evento: ${fallo.message}`
        : "No se pudo guardar el evento.");
    } finally {
      setGuardando(false);
    }
  }

  const errores = validarFormularioEvento(formulario);
  const erroresRevision = validarFormularioEvento(
    formulario,
    new Date(),
    true,
  );
  const estado = popup?.estado;
  const hoy = new Date();
  const fechaMinima = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${
    String(hoy.getDate()).padStart(2, "0")
  }`;
  const fechaMaxima = new Date(
    hoy.getFullYear(),
    hoy.getMonth(),
    hoy.getDate() + MAX_DIAS_EVENTO_FIRESTORE - DIAS_GRACIA - 1,
  );
  const fechaMaximaFormulario = `${
    fechaMaxima.getFullYear()
  }-${String(fechaMaxima.getMonth() + 1).padStart(2, "0")}-${
    String(fechaMaxima.getDate()).padStart(2, "0")
  }`;
  const fechaVistaPrevia = crearDocumentoPopup(formulario, "borrador").fechaEvento;

  return (
    <section aria-labelledby="mi-evento-heading" className="admin-card event-editor">
      <header className="event-editor-heading">
        <div>
          <p className="eyebrow">{empresaNombre}</p>
          <h2 id="mi-evento-heading">Mi evento</h2>
        </div>
        <p aria-live="polite" className="event-status">
          Estado: {estado ? estadoLegible(estado) : "Sin crear"}
        </p>
      </header>
      {popup?.venceEn && (
        <p className="event-expiration">
          Visible hasta {formatearFechaEvento(popup.venceEn)}
        </p>
      )}
      {popup && estaVencido(popup) && (
        <>
          <p className="event-expired" role="status">Vencido</p>
          <p className="event-editor-hint">
            Para reutilizarlo, cambia la fecha y la hora y envíalo de nuevo a
            revisión.
          </p>
        </>
      )}
      {popup && !popup.venceEn && (
        <p className="event-expired" role="status">
          Sin fecha de vencimiento; cambia la fecha del evento y envíalo a revisión.
        </p>
      )}
      {cargando ? (
        <p aria-live="polite">Cargando evento…</p>
      ) : (
        <div className="event-editor-layout">
          <form
            className="event-editor-form"
            noValidate
            onSubmit={(evento: FormEvent<HTMLFormElement>) => {
              evento.preventDefault();
              void guardar("guardar-borrador");
            }}
          >
            <label>
              Título
              <input
                maxLength={80}
                onChange={(evento) => cambiar({ titulo: evento.target.value })}
                required
                value={formulario.titulo}
              />
            </label>
            <label>
              Insignia
              <input
                maxLength={60}
                onChange={(evento) =>
                  cambiar({ insignia: evento.target.value })}
                value={formulario.insignia}
              />
            </label>
            <label>
              Resumen
              <textarea
                maxLength={300}
                onChange={(evento) =>
                  cambiar({ resumen: evento.target.value })}
                required
                value={formulario.resumen}
              />
            </label>
            <label>
              Imagen de portada del evento (URL HTTPS, opcional)
              <span className="event-editor-help" id="event-image-help">
                Pega el enlace directo a una imagen pública. Se mostrará en la
                página del evento; si no agregas una foto del anfitrión,
                también se usará en el popup.
              </span>
              <input
                aria-describedby="event-image-help"
                onChange={(evento) =>
                  cambiar({ imagenUrl: evento.target.value })}
                type="url"
                value={formulario.imagenUrl}
              />
            </label>
            <label>
              Fecha del evento
              <span className="event-editor-help" id="event-date-help">
                Día en que comienza la actividad.
              </span>
              <input
                aria-describedby="event-date-help"
                min={fechaMinima}
                max={fechaMaximaFormulario}
                onChange={(evento) => cambiar({ fecha: evento.target.value })}
                type="date"
                value={formulario.fecha}
              />
            </label>
            <label>
              Hora de inicio del evento
              <span className="event-editor-help" id="event-time-help">
                Es la hora principal que se muestra junto a la fecha; no es la
                lista de horarios que el asistente puede elegir al registrarse.
              </span>
              <input
                aria-describedby="event-time-help"
                onChange={(evento) => cambiar({ hora: evento.target.value })}
                type="time"
                value={formulario.hora}
              />
            </label>
            <fieldset>
              <legend>Opciones de horario para registrarse (máximo 4)</legend>
              <p className="event-editor-help" id="event-schedule-help">
                Son las sesiones o turnos que la persona podrá elegir en el
                formulario de registro. Si solo hay una sesión, agrega aquí su
                horario; la fecha y hora de inicio se indican arriba.
              </p>
              {formulario.horarios.map((horario, indice) => (
                <div className="event-editor-inline" key={indice}>
                  <input
                    aria-label={`Horario ${indice + 1}`}
                    aria-describedby="event-schedule-help"
                    maxLength={80}
                    onChange={(evento) => {
                      const horarios = [...formulario.horarios];
                      horarios[indice] = evento.target.value;
                      cambiar({ horarios });
                    }}
                    value={horario}
                  />
                  <button
                    className="secondary-button"
                    disabled={formulario.horarios.length <= 1}
                    onClick={() =>
                      cambiar({
                        horarios: formulario.horarios.filter(
                          (_, actual) => actual !== indice,
                        ),
                      })}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                className="secondary-button"
                disabled={formulario.horarios.length >= 4}
                onClick={() =>
                  cambiar({ horarios: [...formulario.horarios, ""] })}
                type="button"
              >
                Añadir horario
              </button>
            </fieldset>
            <label>
              Nombre del anfitrión
              <input
                maxLength={80}
                onChange={(evento) =>
                  cambiar({ anfitrionNombre: evento.target.value })}
                required
                value={formulario.anfitrionNombre}
              />
            </label>
            <label>
              Foto HTTPS del anfitrión (opcional)
              <input
                onChange={(evento) =>
                  cambiar({ anfitrionFotoUrl: evento.target.value })}
                type="url"
                value={formulario.anfitrionFotoUrl}
              />
            </label>
            <fieldset>
              <legend>Temas o aprendizajes del evento (máximo 4)</legend>
              <p className="event-editor-help" id="event-topics-help">
                Son los temas que se cubrirán o lo que aprenderán los
                asistentes; no son puntos de calificación. Aparecerán en la
                página pública bajo “Lo que encontrarás”.
              </p>
              {formulario.puntos.map((punto, indice) => (
                <div className="event-editor-point" key={indice}>
                  <label>
                    Tema o aprendizaje {indice + 1}
                    <input
                      aria-describedby="event-topics-help"
                      maxLength={80}
                      onChange={(evento) => {
                        const puntos = [...formulario.puntos];
                        puntos[indice] = {
                          ...puntos[indice],
                          titulo: evento.target.value,
                        };
                        cambiar({ puntos });
                      }}
                      value={punto.titulo}
                    />
                  </label>
                  <label>
                    ¿Qué incluye este tema?
                    <textarea
                      aria-describedby="event-topics-help"
                      maxLength={300}
                      onChange={(evento) => {
                        const puntos = [...formulario.puntos];
                        puntos[indice] = {
                          ...puntos[indice],
                          texto: evento.target.value,
                        };
                        cambiar({ puntos });
                      }}
                      value={punto.texto}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={formulario.puntos.length <= 1}
                    onClick={() =>
                      cambiar({
                        puntos: formulario.puntos.filter(
                          (_, actual) => actual !== indice,
                        ),
                      })}
                    type="button"
                  >
                    Quitar punto
                  </button>
                </div>
              ))}
              <button
                className="secondary-button"
                disabled={formulario.puntos.length >= 4}
                onClick={() =>
                  cambiar({
                    puntos: [...formulario.puntos, { titulo: "", texto: "" }],
                  })}
                type="button"
              >
                Añadir punto
              </button>
            </fieldset>
            <label>
              Cuestionario publicado
              <select
                onChange={(evento) =>
                  cambiar({ cuestionarioId: evento.target.value })}
                required
                value={formulario.cuestionarioId}
              >
                <option value="">Selecciona un cuestionario</option>
                {cuestionarios.map((cuestionario) => (
                  <option key={cuestionario.id} value={cuestionario.id}>
                    {cuestionario.nombre}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {(errores.length > 0 ||
              erroresRevision.includes("fechaEvento")) && (
              <p className="event-editor-hint">
                Completa título, resumen, anfitrión y cuestionario; las imágenes
                deben usar HTTPS. Horarios y puntos admiten hasta 4. La fecha y
                hora son obligatorias para enviar a revisión.
              </p>
            )}
            <div className="event-editor-actions">
              <button
                className="submit-button"
                disabled={guardando}
                type="submit"
              >
                {guardando ? "Guardando…" : "Guardar borrador"}
              </button>
              <button
                className="secondary-button"
                disabled={guardando}
                onClick={() => void guardar("enviar-revision")}
                type="button"
              >
                Enviar a revisión
              </button>
              {estado && estado !== "borrador" && (
                <button
                  className="secondary-button"
                  disabled={guardando}
                  onClick={() => void guardar("volver-borrador")}
                  type="button"
                >
                  Volver a borrador
                </button>
              )}
            </div>
            {modificado && estado === "publicado" && (
              <p aria-live="polite" className="event-editor-hint">
                Al guardar cambios, el evento volverá a revisión.
              </p>
            )}
          </form>
          <aside aria-label="Vista previa del evento" className="event-preview">
            <p className="eyebrow">Vista previa</p>
            <span className="registro-evento__badge">
              {formulario.insignia || "Evento"}
            </span>
            <h3>{formulario.titulo || "Título del evento"}</h3>
            {fechaVistaPrevia && (
              <p>{formatearFechaEvento(fechaVistaPrevia)}</p>
            )}
            <p>{formulario.resumen || "Aquí aparecerá el resumen."}</p>
            <ul>
              {formulario.horarios.filter(Boolean).map((horario) => (
                <li key={horario}>{horario}</li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
}
