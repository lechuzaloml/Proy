import { calcularPerfilSecciones } from "../logic/calcularPerfilSecciones";
import type { RespuestasCuestionario } from "../logic/calcularResultado";
import type { Cuestionario } from "../types/model";

interface ConfirmacionEventoProps {
  nombre: string;
  horario: string;
  cuestionario: Cuestionario;
  respuestas: RespuestasCuestionario;
}

export default function ConfirmacionEvento({
  nombre,
  horario,
  cuestionario,
  respuestas,
}: ConfirmacionEventoProps) {
  const secciones = new Set(
    cuestionario.preguntas.flatMap((pregunta) =>
      pregunta.seccion?.trim() ? [pregunta.seccion.trim()] : []
    ),
  );
  const perfil = calcularPerfilSecciones(cuestionario, respuestas).filter(
    ({ nombre }) => secciones.has(nombre),
  );
  const mostrarPerfil = perfil.length >= 2;

  return (
    <main className="registro-evento">
      <section
        aria-labelledby="confirmacion-evento-heading"
        className="registro-evento__confirmacion"
      >
        <div className="registro-evento__confirmacion-band">
          <div className="registro-evento__confirmacion-card">
            <div className="registro-evento__confirmacion-copy">
              <div
                aria-hidden="true"
                className="registro-evento__confirmacion-check"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6.5 12.5 10 16l8-9"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
              <p className="registro-evento__confirmacion-fecha">
                Registro completado
              </p>
              <h1 id="confirmacion-evento-heading">
                Gracias, {nombre}
              </h1>
              <p className="registro-evento__confirmacion-horario">
                Horario elegido: {horario}
              </p>
              {mostrarPerfil && (
                <section
                  aria-labelledby="perfil-secciones-heading"
                  className="event-profile"
                >
                  <h2 id="perfil-secciones-heading">
                    Tu perfil por sección
                  </h2>
                  {perfil.map((dimension) => (
                    <div className="event-profile-item" key={dimension.nombre}>
                      <div className="event-profile-heading">
                        <strong>{dimension.nombre}</strong>
                        <span>{dimension.porcentaje}%</span>
                      </div>
                      <progress
                        aria-label={`${dimension.nombre}: ${dimension.porcentaje}%`}
                        max={100}
                        value={dimension.porcentaje}
                      />
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
