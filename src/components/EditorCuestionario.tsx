import { useState } from "react";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";
import {
  agregarOpcion,
  agregarPregunta,
  cambiarNombreCuestionario,
  cambiarOpcionPregunta,
  cambiarTextoPregunta,
  eliminarOpcion,
  eliminarPregunta,
  type TipoPregunta,
} from "../templates/editarCuestionario";

interface EditorCuestionarioProps {
  id: string;
  nombre: string;
  cuestionario: Cuestionario;
  onGuardar: (nombre: string, cuestionario: Cuestionario) => void;
  onPrevisualizar: (nombre: string, cuestionario: Cuestionario) => void;
}

const TIPOS_PREGUNTA: { tipo: TipoPregunta; nombre: string }[] = [
  { tipo: "opcion_multiple", nombre: "Opción múltiple" },
  { tipo: "escala", nombre: "Escala" },
  { tipo: "abierta", nombre: "Respuesta abierta" },
];

export default function EditorCuestionario({
  id,
  nombre: nombreInicial,
  cuestionario: cuestionarioInicial,
  onGuardar,
  onPrevisualizar,
}: EditorCuestionarioProps) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [cuestionario, setCuestionario] = useState(cuestionarioInicial);
  const [tipoPregunta, setTipoPregunta] =
    useState<TipoPregunta>("opcion_multiple");
  const [errores, setErrores] = useState<string[]>([]);

  function validarYContinuar(
    continuar: (nombreEditado: string, data: Cuestionario) => void,
  ) {
    const nombreEditado = nombre.trim();
    const cuestionarioEditado = cambiarNombreCuestionario(
      cuestionario,
      nombreEditado,
      id,
    );
    const validacion = validarCuestionario(cuestionarioEditado);
    if (!nombreEditado) {
      setErrores(["El nombre del cuestionario no puede estar vacío."]);
      return;
    }
    if (!validacion.valido) {
      setErrores(validacion.errores);
      return;
    }
    setErrores([]);
    continuar(nombreEditado, validacion.data);
  }

  return (
    <main className="custom-editor">
      <header className="custom-editor-header">
        <p className="eyebrow">Copia temporal · no se guarda en Firestore</p>
        <h1>Personaliza tu cuestionario</h1>
        <p>Los cambios se aplican a esta copia, no a la plantilla original.</p>
        <label className="custom-editor-name">
          Nombre del cuestionario
          <input
            maxLength={120}
            onChange={(evento) => setNombre(evento.target.value)}
            required
            value={nombre}
          />
        </label>
      </header>

      {errores.length > 0 && (
        <div className="validation-errors" role="alert">
          <p>Corrige el cuestionario antes de guardarlo o previsualizarlo:</p>
          <ul>
            {errores.map((error, indice) => <li key={indice}>{error}</li>)}
          </ul>
        </div>
      )}

      <section aria-label="Preguntas del cuestionario" className="custom-editor-questions">
        {cuestionario.preguntas.map((pregunta, indicePregunta) => (
          <article
            className="custom-editor-question"
            key={`${pregunta.id}-${indicePregunta}`}
          >
            <div className="custom-editor-question-heading">
              <h2>Pregunta {indicePregunta + 1} · {pregunta.tipo.replace("_", " ")}</h2>
              <button
                className="secondary-button"
                disabled={cuestionario.preguntas.length <= 1}
                onClick={() => setCuestionario((actual) =>
                  eliminarPregunta(actual, indicePregunta),
                )}
                type="button"
              >
                Eliminar pregunta
              </button>
            </div>
            <label>
              Texto de la pregunta
              <textarea
                maxLength={1000}
                onChange={(evento) => setCuestionario((actual) =>
                  cambiarTextoPregunta(actual, indicePregunta, evento.target.value),
                )}
                value={pregunta.texto}
              />
            </label>

            {pregunta.tipo === "opcion_multiple" && (
              <fieldset className="custom-editor-options">
                <legend>Opciones de respuesta</legend>
                {pregunta.opciones.map((opcion, indiceOpcion) => (
                  <div className="custom-editor-option" key={`${pregunta.id}-${indiceOpcion}`}>
                    <label>
                      Opción {indiceOpcion + 1}
                      <input
                        maxLength={300}
                        onChange={(evento) => setCuestionario((actual) =>
                          cambiarOpcionPregunta(
                            actual,
                            indicePregunta,
                            indiceOpcion,
                            evento.target.value,
                          ),
                        )}
                        value={opcion.texto}
                      />
                    </label>
                    <button
                      aria-label={`Eliminar opción ${indiceOpcion + 1}`}
                      className="secondary-button"
                      disabled={pregunta.opciones.length <= 1}
                      onClick={() => setCuestionario((actual) =>
                        eliminarOpcion(actual, indicePregunta, indiceOpcion),
                      )}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  className="secondary-button"
                  onClick={() => setCuestionario((actual) =>
                    agregarOpcion(actual, indicePregunta),
                  )}
                  type="button"
                >
                  Añadir opción
                </button>
              </fieldset>
            )}
          </article>
        ))}
      </section>

      <section aria-label="Añadir pregunta" className="custom-editor-add">
        <label>
          Tipo de pregunta
          <select
            onChange={(evento) =>
              setTipoPregunta(evento.target.value as TipoPregunta)
            }
            value={tipoPregunta}
          >
            {TIPOS_PREGUNTA.map(({ tipo, nombre: nombreTipo }) => (
              <option key={tipo} value={tipo}>{nombreTipo}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => setCuestionario((actual) =>
            agregarPregunta(actual, tipoPregunta, `pregunta-${crypto.randomUUID()}`),
          )}
          type="button"
        >
          Añadir pregunta
        </button>
      </section>

      <footer className="custom-editor-actions">
        <button
          className="secondary-button"
          onClick={() =>
            validarYContinuar((nombreEditado, data) => onGuardar(nombreEditado, data))
          }
          type="button"
        >
          Guardar cambios
        </button>
        <button
          className="submit-button"
          onClick={() =>
            validarYContinuar((nombreEditado, data) =>
              onPrevisualizar(nombreEditado, data),
            )
          }
          type="button"
        >
          Previsualizar cuestionario
        </button>
      </footer>
    </main>
  );
}
