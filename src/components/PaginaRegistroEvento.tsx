import { useEffect, useRef, useState, type FormEvent } from "react";
import { paginaRegistroEvento } from "../config/paginaRegistroEvento";
import type { Cuestionario } from "../types/model";
import { calcularResultado, type Respuesta, type RespuestasCuestionario } from "../logic/calcularResultado";

interface PaginaRegistroEventoProps {
  cuestionario: Cuestionario;
  onVolver: () => void;
  envioRealizado?: boolean;
  onEnviar: (
    lead: {
      cuestionarioId: string;
      nombre: string;
      correo: string;
      telefono: string;
      respuestas: Record<string, unknown>;
    },
    calculo: ReturnType<typeof calcularResultado>,
    respuestas: RespuestasCuestionario,
    contenidoPersonalizado: string | null,
    errorPersonalizacion: string | null,
  ) => void;
}

const preguntasSeguimiento = paginaRegistroEvento.cuestionarioPostReserva.preguntas;
type OpcionRespuesta = string | { texto: string; puntos?: number };

function obtenerPuntajeActual(respuestas: Record<number, OpcionRespuesta>) {
  const confrontaOpcion = (pregunta: { opciones: OpcionRespuesta[] }, respuesta: OpcionRespuesta) =>
    pregunta.opciones.find((opcion) => {
      if (typeof opcion === "string") {
        return typeof respuesta === "string" ? opcion === respuesta : false;
      }
      if (typeof respuesta === "string") {
        return opcion.texto === respuesta;
      }
      return opcion.texto === respuesta.texto;
    });

  const tienePuntaje = preguntasSeguimiento.some((pregunta) =>
    pregunta.opciones.some((opcion) => typeof opcion !== "string" && typeof opcion.puntos === "number"),
  );

  if (!tienePuntaje) {
    return { tienePuntaje: false, porcentaje: null, contestadas: Object.keys(respuestas).length };
  }

  let puntosObtenidos = 0;
  let puntosMaximos = 0;

  preguntasSeguimiento.forEach((pregunta, indice) => {
    const respuesta = respuestas[indice];
    const opcionSeleccionada = respuesta ? confrontaOpcion(pregunta, respuesta) : undefined;

    if (typeof opcionSeleccionada === "string") {
      return;
    }

    if (!opcionSeleccionada || typeof opcionSeleccionada.puntos !== "number") {
      return;
    }

    puntosObtenidos += opcionSeleccionada.puntos;
    const maximoPregunta = pregunta.opciones.reduce((max, opcion) => {
      if (typeof opcion === "string") {
        return max;
      }
      if (typeof opcion.puntos !== "number") {
        return max;
      }
      return Math.max(max, opcion.puntos);
    }, 0);
    puntosMaximos += maximoPregunta;
  });

  if (puntosMaximos <= 0) {
    return { tienePuntaje: false, porcentaje: null, contestadas: Object.keys(respuestas).length };
  }

  return {
    tienePuntaje: true,
    porcentaje: Math.round((puntosObtenidos / puntosMaximos) * 100),
    contestadas: Object.keys(respuestas).length,
  };
}

function PantallaConfirmacionPendiente({
  nombre,
  horario,
  respuestas,
  onRepetir,
}: {
  nombre: string;
  horario: string;
  respuestas: Record<number, OpcionRespuesta>;
  onRepetir: () => void;
}) {
  const nombrePila = nombre.trim() || "Listo";
  const resultado = obtenerPuntajeActual(respuestas);
  const porcentaje = resultado.porcentaje ?? 0;
  const ayuda = paginaRegistroEvento.confirmacion;
  const [ringValue, setRingValue] = useState(0);
  const [fotoFallida, setFotoFallida] = useState(false);
  const circumference = 2 * Math.PI * 46;

  useEffect(() => {
    if (!resultado.tienePuntaje) {
      setRingValue(0);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setRingValue(porcentaje);
      return;
    }

    const frame = window.requestAnimationFrame(() => setRingValue(porcentaje));
    return () => window.cancelAnimationFrame(frame);
  }, [porcentaje, resultado.tienePuntaje]);

  const ringOffset = circumference - (ringValue / 100) * circumference;

  return (
    <main className="registro-evento">
      <section className="registro-evento__confirmacion">
        <div className="registro-evento__confirmacion-band">
          <div className="registro-evento__confirmacion-card">
            <div className="registro-evento__confirmacion-foto-wrap">
              {fotoFallida ? (
                <div className="registro-evento__confirmacion-foto-fallback" aria-label="Avatar del anfitrión" role="img">
                  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="60" cy="60" r="60" fill="#D7E5FF" />
                    <circle cx="60" cy="46" r="22" fill="#7BA7FF" />
                    <path d="M28 94c9-15 22-22 32-22s23 7 32 22" fill="#7BA7FF" />
                  </svg>
                </div>
              ) : (
                <img
                  alt={paginaRegistroEvento.anfitrion.alt}
                  className="registro-evento__confirmacion-foto"
                  onError={() => setFotoFallida(true)}
                  src={paginaRegistroEvento.anfitrion.foto}
                />
              )}
            </div>

            <div className="registro-evento__confirmacion-copy">
              <div className="registro-evento__confirmacion-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.5 12.5 10 16l8-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                </svg>
              </div>

              <h2>
                {nombrePila}, tu lugar está <span>{ayuda.confirmado}</span>
              </h2>

              <div className="registro-evento__confirmacion-deco" aria-hidden="true">
                <svg viewBox="0 0 168 14" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 10c18-10 31 7 52-1 11-4 25-11 41-3 15 7 11 18 29 4 14-11 13 10 36-4 11-7 20-8 30 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                </svg>
              </div>

              <p className="registro-evento__confirmacion-fecha">{paginaRegistroEvento.fecha}</p>
              <p className="registro-evento__confirmacion-horario">{horario}</p>
              <p className="registro-evento__confirmacion-texto">{ayuda.texto}</p>

              <button
                className="registro-evento__button registro-evento__button--confirmacion"
                onClick={() => {
                  const bloque = document.getElementById("registro-evento-resultado");
                  bloque?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                type="button"
              >
                {ayuda.boton}
              </button>
            </div>
          </div>
        </div>

        <section className="registro-evento__resultado" id="registro-evento-resultado">
          <div className="registro-evento__resultado-grid">
            <div className="registro-evento__resultado-card registro-evento__resultado-card--ring">
              {resultado.tienePuntaje ? (
                <>
                  <div className="registro-evento__progress-ring" aria-label={`Porcentaje de resultado: ${porcentaje}%`}>
                    <svg className="registro-evento__progress-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                      <circle className="registro-evento__progress-bg" cx="60" cy="60" r="46" />
                      <circle
                        className="registro-evento__progress-value"
                        cx="60"
                        cy="60"
                        r="46"
                        style={{ strokeDasharray: circumference, strokeDashoffset: ringOffset }}
                      />
                    </svg>
                    <div className="registro-evento__progress-center">
                      <strong>{porcentaje}%</strong>
                    </div>
                  </div>
                  <p className="registro-evento__resultado-legend">{ayuda.resultado.leyenda}</p>
                </>
              ) : (
                <div className="registro-evento__resultado-plain">
                  <div className="registro-evento__resultado-stat">
                    <strong>{resultado.contestadas}</strong>
                  </div>
                  <p>{ayuda.resultado.sinPuntaje}</p>
                </div>
              )}
            </div>

            <div className="registro-evento__resultado-copy">
              <h3>
                {ayuda.resultado.tituloInicio}
                <span>{ayuda.resultado.tituloFinal}</span>
              </h3>
              <p>{ayuda.resultado.descripcion}</p>

              <div className="registro-evento__resultado-actions">
                <button className="registro-evento__button" onClick={onRepetir} type="button">
                  {ayuda.resultado.repetir}
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function irAlFormulario() {
  const formulario = document.getElementById("registro-evento-formulario");
  if (!formulario) {
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  formulario.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  const campo = formulario.querySelector<HTMLInputElement>("input[name='nombre']");
  campo?.focus();
}

export default function PaginaRegistroEvento({
  cuestionario,
  onVolver: _onVolver,
  onEnviar,
  envioRealizado = false,
}: PaginaRegistroEventoProps) {
  const [error, setError] = useState("");
  const [lada, setLada] = useState("+52");
  const [faseCuestionario, setFaseCuestionario] = useState<"formulario" | "cuestionario" | "completado">(
    envioRealizado ? "cuestionario" : "formulario",
  );
  const [indicePregunta, setIndicePregunta] = useState(0);
  const [respuestasCuestionario, setRespuestasCuestionario] = useState<Record<number, OpcionRespuesta>>({});
  const [registroForm, setRegistroForm] = useState({ nombre: "Listo", horario: "" });
  const nombreRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (envioRealizado) {
      setFaseCuestionario("cuestionario");
      setIndicePregunta(0);
    }
  }, [envioRealizado]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const htmlBackground = html.style.backgroundColor;
    const bodyBackground = body.style.backgroundColor;
    const htmlOverscroll = html.style.overscrollBehavior;
    const bodyOverscroll = body.style.overscrollBehavior;

    html.classList.add("registro-evento-page");
    body.classList.add("registro-evento-page");
    html.style.backgroundColor = "#05060A";
    body.style.backgroundColor = "#05060A";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    return () => {
      html.classList.remove("registro-evento-page");
      body.classList.remove("registro-evento-page");
      html.style.backgroundColor = htmlBackground;
      body.style.backgroundColor = bodyBackground;
      html.style.overscrollBehavior = htmlOverscroll;
      body.style.overscrollBehavior = bodyOverscroll;
    };
  }, []);

  const manejarSubmit = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const nombre = String(formData.get("nombre") ?? "").trim();
    const apellido = String(formData.get("apellido") ?? "").trim();
    const correo = String(formData.get("correo") ?? "").trim();
    const telefono = String(formData.get("telefono") ?? "").trim();
    const horario = String(formData.get("horario") ?? "").trim();

    if (!nombre || !apellido || !correo || !telefono || !horario) {
      setError("Completa todos los campos para reservar tu lugar.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Introduce un correo empresarial válido.");
      return;
    }

    const telefonoSoloDigitos = telefono.replace(/\D/g, "");
    if (telefonoSoloDigitos.length < 7 || telefonoSoloDigitos.length > 15) {
      setError("El celular debe tener entre 7 y 15 dígitos.");
      return;
    }

    const indiceHorario = cuestionario.preguntas[0]?.tipo === "opcion_multiple"
      ? cuestionario.preguntas[0].opciones.findIndex((opcion) => opcion.texto === horario)
      : 0;

    const respuesta: Respuesta = {
      tipo: "opcion_multiple",
      indiceOpcion: indiceHorario >= 0 ? indiceHorario : 0,
    };

    const respuestas: RespuestasCuestionario = {
      0: respuesta,
    };

    const calculo = calcularResultado(cuestionario, respuestas);

    const nombreCompleto = `${nombre} ${apellido}`.trim();

    onEnviar(
      {
        cuestionarioId: cuestionario.id,
        nombre: nombreCompleto,
        correo,
        telefono: `${lada}${telefonoSoloDigitos}`,
        respuestas: { horario },
      },
      calculo,
      respuestas,
      null,
      null,
    );
    setRegistroForm({
      nombre: nombre || "Listo",
      horario,
    });
    setError("");
    setIndicePregunta(0);
    setRespuestasCuestionario({});
    setFaseCuestionario("cuestionario");
  };

  if (faseCuestionario === "cuestionario") {
    const preguntaActual = preguntasSeguimiento[indicePregunta];
    if (!preguntaActual) {
      return (
        <main className="registro-evento">
          <section className="registro-evento__survey registro-evento__survey--complete">
            <div className="registro-evento__survey-card">
              <span className="registro-evento__learn-label">Siguiente paso</span>
              <h2>Se ha completado la reserva y el cuestionario.</h2>
              <p>Las cinco respuestas quedan preparadas para la siguiente pantalla de confirmación.</p>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="registro-evento">
        <section className="registro-evento__survey" aria-live="polite">
          <div className="registro-evento__survey-card">
            <div className="registro-evento__survey-meta">
              <span className="registro-evento__learn-label">Cuestionario</span>
              <p className="registro-evento__survey-progress">Pregunta {indicePregunta + 1} de {preguntasSeguimiento.length}</p>
            </div>

            <progress
              aria-label="Progreso del cuestionario"
              className="registro-evento__progress"
              max={preguntasSeguimiento.length}
              value={indicePregunta + 1}
            />

            <h2>{preguntaActual.pregunta}</h2>
            {preguntaActual.ayuda && <p className="registro-evento__survey-help">{preguntaActual.ayuda}</p>}

            <div className="registro-evento__survey-options">
              {preguntaActual.opciones.map((opcion, indiceOpcion) => {
                const seleccionada = respuestasCuestionario[indicePregunta] === opcion;
                const clave = `${preguntaActual.id}-${indiceOpcion}`;
                return (
                  <button
                    key={clave}
                    className={`registro-evento__survey-option${seleccionada ? " is-selected" : ""}`}
                    onClick={() => {
                      setRespuestasCuestionario((anterior) => ({
                        ...anterior,
                        [indicePregunta]: opcion,
                      }));
                    }}
                    type="button"
                  >
                    {typeof opcion === "string" ? opcion : opcion.texto}
                  </button>
                );
              })}
            </div>

            <div className="registro-evento__survey-actions">
              {indicePregunta > 0 && (
                <button
                  className="registro-evento__button registro-evento__button--secondary"
                  onClick={() => setIndicePregunta((actual) => actual - 1)}
                  type="button"
                >
                  Anterior
                </button>
              )}

              <button
                className="registro-evento__button"
                disabled={!respuestasCuestionario[indicePregunta]}
                onClick={() => {
                  if (indicePregunta < preguntasSeguimiento.length - 1) {
                    setIndicePregunta((actual) => actual + 1);
                    return;
                  }
                  setFaseCuestionario("completado");
                }}
                type="button"
              >
                {indicePregunta < preguntasSeguimiento.length - 1 ? "Continuar" : "Finalizar"}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (faseCuestionario === "completado") {
    return (
      <PantallaConfirmacionPendiente
        horario={registroForm.horario || paginaRegistroEvento.horarioOpciones[0]}
        nombre={registroForm.nombre}
        onRepetir={() => {
          setRespuestasCuestionario({});
          setIndicePregunta(0);
          setFaseCuestionario("cuestionario");
        }}
        respuestas={respuestasCuestionario}
      />
    );
  }

  return (
    <main className="registro-evento">
      <header className="registro-evento__hero">
        <div className="registro-evento__topbar">
          <div className="registro-evento__brand">{paginaRegistroEvento.marca}</div>
        </div>

        <div className="registro-evento__content">
          <div className="registro-evento__copy">
            <span className="registro-evento__badge">
              {paginaRegistroEvento.insignia}
            </span>
            <h1>{paginaRegistroEvento.titulo}</h1>
            <p className="registro-evento__date">{paginaRegistroEvento.fecha}</p>
            <div className="registro-evento__schedule">
              {paginaRegistroEvento.horarios.map((horario) => (
                <span key={horario}>{horario}</span>
              ))}
            </div>
            <div className="registro-evento__host-line" aria-label="Presenta a Carlos Torres">
              <span className="registro-evento__host-label">{paginaRegistroEvento.anfitrion.etiqueta}</span>
              <div className="registro-evento__host-avatar">
                <img alt={paginaRegistroEvento.anfitrion.alt} src={paginaRegistroEvento.anfitrion.foto} />
              </div>
              <strong>{paginaRegistroEvento.anfitrion.nombre}</strong>
            </div>
          </div>

          <aside className="registro-evento__card" id="registro-evento-formulario">
            <div className="registro-evento__card-header">
              <h2>{paginaRegistroEvento.tarjeta.titulo}</h2>
              <p>{paginaRegistroEvento.tarjeta.ayuda}</p>
            </div>

            <form aria-label="Formulario de registro" className="registro-evento__form" onSubmit={manejarSubmit} noValidate>
              <div className="registro-evento__row">
                <label className="registro-evento__field">
                  <span>{paginaRegistroEvento.formulario.nombre}</span>
                  <input autoComplete="given-name" name="nombre" ref={nombreRef} required type="text" />
                </label>
                <label className="registro-evento__field">
                  <span>{paginaRegistroEvento.formulario.apellido}</span>
                  <input autoComplete="family-name" name="apellido" required type="text" />
                </label>
              </div>

              <label className="registro-evento__field">
                <span>{paginaRegistroEvento.formulario.correo}</span>
                <input autoComplete="email" name="correo" required type="email" />
              </label>

              <label className="registro-evento__field">
                <span>{paginaRegistroEvento.formulario.celular}</span>
                <div className="registro-evento__phone-wrap">
                  <select aria-label="Prefijo telefónico" name="lada" onChange={(evento) => setLada(evento.target.value)} value={lada}>
                    {paginaRegistroEvento.formulario.lada.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.label}
                      </option>
                    ))}
                  </select>
                  <input autoComplete="tel" inputMode="numeric" maxLength={15} name="telefono" pattern="[0-9]{7,15}" placeholder="5551234567" required type="tel" />
                </div>
              </label>

              <label className="registro-evento__field">
                <span>{paginaRegistroEvento.formulario.horario}</span>
                <select defaultValue="" name="horario" required>
                  <option disabled value="">Selecciona una opción</option>
                  {paginaRegistroEvento.horarioOpciones.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </select>
              </label>

              <button className="registro-evento__button" type="submit">
                {paginaRegistroEvento.formulario.boton}
              </button>

              <p aria-live="polite" className="registro-evento__error">
                {error}
              </p>
            </form>
          </aside>
        </div>
      </header>

      <section className="registro-evento__learn">
        <div className="registro-evento__learn-shell">
          <span className="registro-evento__learn-label">{paginaRegistroEvento.aprender.etiqueta}</span>
          <h2>{paginaRegistroEvento.aprender.titulo}</h2>
          <p>{paginaRegistroEvento.aprender.intro}</p>
          <div className="registro-evento__learn-grid">
            <ol className="registro-evento__learn-list">
              {paginaRegistroEvento.aprender.puntos.map((punto, indice) => (
                <li key={punto.titulo}>
                  <span className="registro-evento__learn-number">{indice + 1}</span>
                  <div>
                    <h3>{punto.titulo}</h3>
                    <p>{punto.descripcion}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="registro-evento__ring-card">
              <div className="registro-evento__ring" aria-label="Diagrama de tres pasos">
                <div className="registro-evento__ring-center">
                  {paginaRegistroEvento.anillo.central.map((texto) => (
                    <span key={texto}>{texto}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="registro-evento__host">
        <div className="registro-evento__host-shell">
          <div className="registro-evento__host-photo-wrap">
            <img alt={paginaRegistroEvento.anfitrion.alt} className="registro-evento__host-photo" src={paginaRegistroEvento.anfitrion.foto} />
          </div>

          <div className="registro-evento__host-copy">
            <span className="registro-evento__host-label">{paginaRegistroEvento.anfitrionSeccion.etiqueta}</span>
            <h2>{paginaRegistroEvento.anfitrionSeccion.nombre}</h2>
            <p className="registro-evento__host-subtitle">{paginaRegistroEvento.anfitrionSeccion.subtitulo}</p>
            <div className="registro-evento__host-divider" />
            {paginaRegistroEvento.anfitrionSeccion.parrafos.map((parrafo) => (
              <p key={parrafo}>{parrafo}</p>
            ))}
            <button className="registro-evento__button registro-evento__button--secondary" onClick={irAlFormulario} type="button">
              {paginaRegistroEvento.anfitrionSeccion.boton}
            </button>
          </div>
        </div>
      </section>

      <section className="registro-evento__cta">
        <div className="registro-evento__cta-shell">
          <h2>{paginaRegistroEvento.cierre.titulo}</h2>
          <p>{paginaRegistroEvento.cierre.texto}</p>
          <button className="registro-evento__button registro-evento__button--light" onClick={irAlFormulario} type="button">
            {paginaRegistroEvento.cierre.boton}
          </button>
        </div>
      </section>

      <footer className="registro-evento__footer">
        <div className="registro-evento__footer-brand">{paginaRegistroEvento.marca}</div>
        <div className="registro-evento__footer-copy">{paginaRegistroEvento.pie}</div>
      </footer>
    </main>
  );
}
