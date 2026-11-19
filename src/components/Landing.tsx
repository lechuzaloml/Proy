import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { db } from "../lib/firebase";
import {
  filtrarPopupsPublicadosActivos,
  formatearFechaEvento,
  motivoDescartePopup,
  popupDesdeDatos,
  seleccionarPopupsInicio,
  type PopupListado,
} from "../eventos/popups";

interface LandingProps {
  onComenzar: () => void;
  onAbrirRegistroEvento?: (empresaId: string) => void;
}

const POPUP_DEMO: PopupListado = {
  id: "clearia",
  empresaNombre: "Clear-IA",
  titulo: "Masterclass en vivo con Carlos Torres",
  insignia: "Masterclass gratuita",
  resumen:
    "Únete a esta masterclass gratuita de 90 minutos y aprende cómo generar mejores leads, generar confianza y convertir más atención en clientes.",
  horarios: ["Reserva tu lugar"],
  anfitrion: {
    nombre: "Carlos Torres",
    fotoUrl: "/pasted-image.png",
  },
  cuestionarioId: "",
  estado: "publicado",
};

const retosNegocio = [
  {
    numero: "01",
    titulo: "Captación de oportunidades",
    paraQue:
      "Identifica si tu negocio atrae prospectos de manera clara y constante.",
  },
  {
    numero: "02",
    titulo: "Priorización de prospectos",
    paraQue:
      "Reconoce oportunidades para definir cuáles prospectos requieren atención primero.",
  },
  {
    numero: "03",
    titulo: "Seguimiento comercial",
    paraQue:
      "Detecta cómo dar continuidad a las conversaciones y avanzar cada oportunidad.",
  },
];

function obtenerCodigoError(fallo: unknown): string {
  return typeof fallo === "object" && fallo !== null &&
      "code" in fallo && typeof fallo.code === "string"
    ? fallo.code
    : "error desconocido";
}

export default function Landing({
  onComenzar,
  onAbrirRegistroEvento,
}: LandingProps) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [popups, setPopups] = useState<PopupListado[]>([]);
  const [indicePopup, setIndicePopup] = useState(0);
  const [indiceImagenPopup, setIndiceImagenPopup] = useState(0);
  const [eventosCargados, setEventosCargados] = useState(false);
  const [errorPopups, setErrorPopups] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const problemReveal = useScrollReveal<HTMLElement>();
  const sectionHeadingReveal = useScrollReveal<HTMLElement>();
  const solutionGridReveal = useScrollReveal<HTMLDivElement>({
    staggerChildren: true,
  });
  const nextStepReveal = useScrollReveal<HTMLElement>();

  useEffect(() => {
    let cancelado = false;
    let revisionConsulta = 0;
    const database = db;
    if (!database) {
      setErrorPopups("No se pudieron consultar los eventos publicados.");
      setEventosCargados(true);
      return;
    }

    const consulta = query(
      collection(database, "popups"),
      where("estado", "==", "publicado"),
    );
    const cancelarSuscripcion = onSnapshot(
      consulta,
      { includeMetadataChanges: true },
      (resultado) => {
        const revision = ++revisionConsulta;
        if (resultado.metadata.fromCache && resultado.empty) {
          return;
        }
        void (async () => {
          const publicados = resultado.docs.flatMap((snapshot) => {
            const popup = popupDesdeDatos(snapshot.id, snapshot.data());
            if (!popup) {
              console.warn("[carrusel] Popup descartado", {
                empresaId: snapshot.id,
                motivo: "el documento tiene un formato no válido",
              });
              return [];
            }
            return [popup];
          });
          const candidatos = publicados.filter((popup) => {
            if (!popup.fechaEvento) {
              console.warn("[carrusel] Popup descartado", {
                empresaId: popup.id,
                motivo: "no tiene fecha del evento",
              });
              return false;
            }
            if (!popup.venceEn) {
              console.warn("[carrusel] Popup descartado", {
                empresaId: popup.id,
                motivo: "no tiene fecha de vencimiento",
              });
              return false;
            }
            if (motivoDescartePopup(popup, true, true) === "está vencido") {
              console.warn("[carrusel] Popup descartado", {
                empresaId: popup.id,
                motivo: "el evento está vencido",
              });
              return false;
            }
            return true;
          });
          const empresaActiva = new Map<string, boolean>();
          const nombresEmpresas = new Map<string, string>();
          const cuestionarioPublicado = new Map<string, boolean>();
          const erroresConsulta = new Map<string, string>();
          await Promise.all(candidatos.map(async (popup) => {
            try {
              const empresa = await getDoc(doc(database, "empresas", popup.id));
              const activa = empresa.exists() &&
                empresa.data().estado === "activa";
              empresaActiva.set(popup.id, activa);
              if (empresa.exists()) {
                const nombre = empresa.data().nombre;
                nombresEmpresas.set(
                  popup.id,
                  typeof nombre === "string" && nombre.trim()
                    ? nombre
                    : popup.id,
                );
              }
              if (!activa) {
                return;
              }
            } catch (fallo: unknown) {
              erroresConsulta.set(
                popup.id,
                `no se pudo verificar si la empresa está activa (${obtenerCodigoError(fallo)})`,
              );
              empresaActiva.set(popup.id, false);
              return;
            }
            try {
              const cuestionario = await getDoc(doc(
                database,
                "empresas",
                popup.id,
                "cuestionarios",
                popup.cuestionarioId,
              ));
              cuestionarioPublicado.set(
                `${popup.id}/${popup.cuestionarioId}`,
                cuestionario.exists() &&
                  cuestionario.data().estado === "publicado",
              );
            } catch (fallo: unknown) {
              erroresConsulta.set(
                popup.id,
                `no se pudo verificar el cuestionario publicado (${obtenerCodigoError(fallo)})`,
              );
              cuestionarioPublicado.set(
                `${popup.id}/${popup.cuestionarioId}`,
                false,
              );
            }
          }));
          if (!cancelado && revision === revisionConsulta) {
            const elegibles = filtrarPopupsPublicadosActivos(
              candidatos,
              empresaActiva,
              cuestionarioPublicado,
            );
            for (const popup of candidatos) {
              const motivo = erroresConsulta.get(popup.id) ??
                motivoDescartePopup(
                  popup,
                  empresaActiva.get(popup.id),
                  cuestionarioPublicado.get(
                    `${popup.id}/${popup.cuestionarioId}`,
                  ),
                );
              if (motivo) {
                console.warn("[carrusel] Popup descartado", {
                  empresaId: popup.id,
                  motivo,
                });
              }
            }
            setPopups(seleccionarPopupsInicio(
              elegibles.map((popup) => ({
                ...popup,
                empresaNombre: nombresEmpresas.get(popup.id) ?? popup.id,
              })),
              POPUP_DEMO,
            ));
            setErrorPopups("");
            setEventosCargados(true);
          }
        })().catch((fallo: unknown) => {
          console.error("[carrusel] No se pudieron cargar los eventos publicados.", fallo);
          if (!cancelado && revision === revisionConsulta) {
            setErrorPopups("No se pudieron cargar los eventos publicados.");
            setPopups([]);
            setModalAbierto(false);
            setEventosCargados(true);
          }
        });
      },
      (fallo: unknown) => {
        console.error("[carrusel] Error de suscripción a eventos publicados.", {
          codigo: obtenerCodigoError(fallo),
          error: fallo,
        });
        if (!cancelado) {
          setErrorPopups("No se pudieron cargar los eventos publicados.");
          setPopups([]);
          setModalAbierto(false);
          setEventosCargados(true);
        }
      },
    );
    return () => {
      cancelado = true;
      cancelarSuscripcion();
    };
  }, []);

  useEffect(() => {
    if (!eventosCargados || errorPopups || popups.length === 0) {
      return;
    }
    const tieneEventosPublicados = popups[0] !== POPUP_DEMO;
    const claveSesion = "clearIaPopupVisto:default";
    if (!tieneEventosPublicados) {
      let mostrado = false;
      try {
        mostrado = window.sessionStorage.getItem(claveSesion) === "1";
      } catch (fallo: unknown) {
        console.error("No se pudo consultar la sesión del popup.", fallo);
      }
      if (mostrado) {
        return;
      }
    }
    const temporizador = window.setTimeout(() => {
      if (!tieneEventosPublicados) {
        try {
          window.sessionStorage.setItem(claveSesion, "1");
        } catch (fallo: unknown) {
          console.error("No se pudo guardar la sesión del popup.", fallo);
        }
      }
      setModalAbierto(true);
    }, 250);

    return () => window.clearTimeout(temporizador);
  }, [eventosCargados, errorPopups, popups]);

  useEffect(() => {
    if (!modalAbierto) {
      return;
    }

    const focoAnterior = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cerrarRef.current?.focus();
    const manejarTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        cerrarModal();
        return;
      }
      if (evento.key === "ArrowRight") {
        evento.preventDefault();
        avanzarPopup(1);
        return;
      }
      if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        avanzarPopup(-1);
        return;
      }
      if (evento.key !== "Tab" || !modalRef.current) {
        return;
      }
      const elementos = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (elementos.length === 0) {
        evento.preventDefault();
        return;
      }
      const primero = elementos[0];
      const ultimo = elementos[elementos.length - 1];
      if (!modalRef.current.contains(document.activeElement)) {
        evento.preventDefault();
        primero.focus();
        return;
      }
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", manejarTeclado);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", manejarTeclado);
      focoAnterior?.focus();
    };
  }, [modalAbierto, popups.length]);

  const popupActivo = popups[indicePopup] ?? popups[0] ?? POPUP_DEMO;
  const imagenesPopup: { src: string; alt: string }[] = [];
  if (popupActivo.imagenUrl) {
    imagenesPopup.push({
      src: popupActivo.imagenUrl,
      alt: popupActivo.titulo,
    });
  }
  if (popupActivo.anfitrion?.fotoUrl) {
    imagenesPopup.push({
      src: popupActivo.anfitrion.fotoUrl,
      alt: popupActivo.anfitrion.nombre,
    });
  }
  const imagenesPopupUnicas = imagenesPopup.filter(
    (imagen, indice, todas) =>
      todas.findIndex((candidata) => candidata.src === imagen.src) === indice,
  );
  const imagenActualPopup = imagenesPopupUnicas[indiceImagenPopup];

  useEffect(() => {
    setIndiceImagenPopup(0);
  }, [
    popupActivo.id,
    popupActivo.imagenUrl,
    popupActivo.anfitrion?.fotoUrl,
  ]);

  function cerrarModal() {
    setModalAbierto(false);
  }

  function manejarAccionPromocional() {
    if (onAbrirRegistroEvento) {
      const empresaId = popupActivo.id;
      cerrarModal();
      onAbrirRegistroEvento(empresaId);
      return;
    }
    console.info("CTA promocional provisional: conectar la acción real del modal aquí.");
    cerrarModal();
  }

  function avanzarPopup(direccion: number) {
    setIndicePopup((actual) =>
      (actual + direccion + popups.length) % popups.length
    );
  }

  return (
    <>
      {modalAbierto && (
        <div
          aria-modal="true"
          className="promo-modal-backdrop"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) {
              cerrarModal();
            }
          }}
          role="dialog"
          aria-labelledby="promo-title"
          aria-describedby="promo-description"
        >
          <div className="promo-modal" ref={modalRef}>
            <div className="promo-modal-header">
              <button
                aria-label="Cerrar promoción"
                className="promo-modal-close"
                ref={cerrarRef}
                onClick={cerrarModal}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="promo-modal-content">
              <div className="promo-modal-copy">
                <p className="promo-modal-kicker">
                  {popupActivo.empresaNombre ?? popupActivo.id}
                </p>
                <h2 aria-live="polite" id="promo-title">
                  {popupActivo.titulo}
                </h2>
                <p className="promo-modal-description" id="promo-description">
                  {popupActivo.resumen}
                </p>
                {popupActivo.fechaEvento && (
                  <p className="promo-modal-date">
                    {formatearFechaEvento(popupActivo.fechaEvento)}
                  </p>
                )}
                <div className="promo-modal-actions">
                  <button
                    className="submit-button promo-modal-primary"
                    onClick={manejarAccionPromocional}
                    type="button"
                  >
                    Registrarme
                  </button>
                  <button
                    className="promo-modal-secondary"
                    onClick={cerrarModal}
                    type="button"
                  >
                    No gracias
                  </button>
                </div>
              </div>

              <div aria-label="Imagen del evento" className="promo-modal-visual">
                {imagenActualPopup ? (
                  <img
                    alt={imagenActualPopup.alt}
                    className="promo-modal-visual-inner promo-modal-visual-image"
                    onError={() => {
                      setIndiceImagenPopup((actual) =>
                        Math.min(actual + 1, imagenesPopupUnicas.length),
                      );
                    }}
                    src={imagenActualPopup.src}
                  />
                ) : (
                  <div
                    aria-label="Imagen no disponible"
                    className="promo-modal-visual-inner promo-modal-visual-image popup-image-fallback"
                    role="img"
                  >
                    Imagen no disponible
                  </div>
                )}
              </div>
            </div>
            {popups.length > 1 && (
              <nav aria-label="Navegación de eventos" className="promo-carousel-controls">
                <button
                  aria-label="Evento anterior"
                  className="secondary-button"
                  onClick={() => avanzarPopup(-1)}
                  type="button"
                >
                  Anterior
                </button>
                <div aria-label="Seleccionar evento" className="promo-carousel-dots">
                  {popups.map((popup, indice) => (
                    <button
                      aria-current={indice === indicePopup ? "true" : undefined}
                      aria-label={`Mostrar evento ${indice + 1}: ${popup.titulo}`}
                      className="promo-carousel-dot"
                      key={`${popup.id}-${indice}`}
                      onClick={() => setIndicePopup(indice)}
                      type="button"
                    >
                      {indice + 1}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Evento siguiente"
                  className="secondary-button"
                  onClick={() => avanzarPopup(1)}
                  type="button"
                >
                  Siguiente
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      <main className="landing-page">
        {errorPopups && (
          <p className="admin-error" role="alert">{errorPopups}</p>
        )}
        <section aria-labelledby="landing-title" className="landing-hero">
        <div className="landing-intro">
          <p className="landing-kicker">Una mirada clara a tu crecimiento</p>
          <h1 id="landing-title">
            Diagnostica el potencial de crecimiento de tu negocio
          </h1>
          <p className="landing-description">
            Responde un breve diagnóstico sobre tu negocio e identifica las
            principales áreas de oportunidad que pueden estar limitando su
            crecimiento.
          </p>
          <div className="landing-actions">
            <button
              className="submit-button"
              onClick={onComenzar}
              type="button"
            >
              Iniciar diagnóstico
              <span aria-hidden="true" className="landing-button-arrow">
                <svg
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 12h15m-6-6 6 6-6 6" />
                </svg>
              </span>
            </button>
            <p className="landing-duration">
              <span aria-hidden="true" className="landing-duration-dot" />
              Aproximadamente 2–3 minutos
            </p>
          </div>
        </div>

        <aside
          aria-labelledby="landing-purpose-title"
          className="landing-purpose"
        >
          <p className="eyebrow">Tu punto de partida</p>
          <h2 id="landing-purpose-title">¿Qué podrás revisar?</h2>
          <p className="landing-purpose-intro">
            Una perspectiva práctica de cómo estás atrayendo y atendiendo
            oportunidades comerciales.
          </p>
          <ol>
            <li>
              <span className="landing-topic-number">01</span>
              <span>Generación de nuevas oportunidades</span>
            </li>
            <li>
              <span className="landing-topic-number">02</span>
              <span>Priorización de prospectos</span>
            </li>
            <li>
              <span className="landing-topic-number">03</span>
              <span>Seguimiento y avance comercial</span>
            </li>
          </ol>
          <div className="landing-outcome">
            <span className="landing-outcome-rule" aria-hidden="true" />
            <p>
              Al finalizar, recibirás una orientación inicial y recursos
              demostrativos relacionados con tus respuestas.
            </p>
          </div>
        </aside>
      </section>

      <section
        aria-labelledby="landing-problem-title"
        className="landing-problem"
        ref={problemReveal}
      >
        <div className="landing-problem-copy">
          <p className="landing-problem-kicker">El problema</p>
          <h2 id="landing-problem-title">
            El problema no es la falta de opciones.
          </h2>
          <p>
            Cuestionarios, evaluaciones, listas de espera, encuestas y
            seminarios web: hay muchas maneras de convertir la atención en
            acción.
          </p>
          <p>
            Lo difícil es saber cuál se adapta realmente a las necesidades de
            tu negocio en este momento.
          </p>
          <p>
            Adivinar, copiar un embudo ajeno o pasar demasiado tiempo comparando
            opciones puede llevarte a crear algo que no encaja — o a no empezar.
          </p>
        </div>

        <div
          aria-label="Opciones para conectar con prospectos"
          className="landing-options-visual"
          role="img"
        >
          <span className="landing-option-chip landing-option-forms">
            Formularios
          </span>
          <span className="landing-option-chip landing-option-webinars">
            Seminarios web
          </span>
          <span className="landing-option-chip landing-option-surveys">
            Encuestas
          </span>
          <span className="landing-option-chip landing-option-funnels">
            Embudos de cuestionarios
          </span>
          <span className="landing-option-chip landing-option-waitlists">
            Listas de espera
          </span>
          <span className="landing-option-chip landing-option-dashboards">
            Cuadros de mando
          </span>
          <div className="landing-profile">
            <div aria-hidden="true" className="landing-profile-avatar">
              <svg
                fill="none"
                role="presentation"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="32" cy="32" r="31" />
                <circle cx="32" cy="24" r="10" />
                <path d="M13 55c2.7-10 9.2-15 19-15s16.3 5 19 15" />
              </svg>
            </div>
            <span className="landing-profile-name">Tu negocio</span>
            <span className="landing-profile-role">En busca de crecimiento</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-solutions-title" className="landing-section">
        <header className="landing-section-heading" ref={sectionHeadingReveal}>
          <p className="landing-kicker">Tres áreas para entender mejor</p>
          <h2 id="landing-solutions-title">
            ¿Qué puede ayudarte a resolver el diagnóstico?
          </h2>
          <p>
            Obtén una primera perspectiva de los aspectos que influyen en la
            gestión de tus oportunidades comerciales.
          </p>
        </header>

        <div className="landing-solution-grid" ref={solutionGridReveal}>
          {retosNegocio.map((reto) => (
            <article className="landing-solution" key={reto.numero}>
              <span aria-hidden="true" className="landing-solution-number">
                {reto.numero}
              </span>
              <h3>{reto.titulo}</h3>
              <p className="landing-solution-label">¿Para qué?</p>
              <p>{reto.paraQue}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="landing-next-step-title"
        className="landing-next-step"
        ref={nextStepReveal}
      >
        <p className="landing-next-step-kicker">Tu próximo paso</p>
        <h2 id="landing-next-step-title">
          Deja de pensar demasiado en qué construir.
          <span> Identifiquemos el siguiente paso correcto.</span>
        </h2>
        <p className="landing-next-step-description">
          <strong>7 preguntas. Una orientación clara.</strong> Descubre qué áreas
          comerciales conviene atender primero para impulsar el crecimiento de
          tu negocio.
        </p>
        <button
          className="landing-next-step-button"
          onClick={onComenzar}
          type="button"
        >
          Iniciar diagnóstico
          <span aria-hidden="true" className="landing-next-step-arrow">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 12h15m-6-6 6 6-6 6" />
            </svg>
          </span>
        </button>
        <p className="landing-next-step-note">
          Toma aproximadamente 2–3 minutos.
        </p>
      </section>
    </main>
  </>
);
}