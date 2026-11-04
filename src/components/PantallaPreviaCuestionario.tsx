import { useState } from "react";
import type { Cuestionario } from "../types/model";
import { TEXTO_AVISO_PRIVACIDAD } from "../config/privacidad";
import {
  contarPreguntas,
  crearPasosCuestionario,
  estimarMinutos,
} from "../config/presentacionCuestionario";

interface PantallaPreviaCuestionarioProps {
  cuestionario: Cuestionario;
  titulo: string;
  descripcion: string;
  textoBoton: string;
  requiereConsentimiento: boolean;
  templateId?: string;
  onComenzar: () => void;
}

export default function PantallaPreviaCuestionario({
  cuestionario,
  titulo,
  descripcion,
  textoBoton,
  requiereConsentimiento,
  templateId,
  onComenzar,
}: PantallaPreviaCuestionarioProps) {
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  const cantidadPreguntas = contarPreguntas(cuestionario.preguntas);
  const minutosEstimados = estimarMinutos(cantidadPreguntas);
  const pasos = crearPasosCuestionario(
    cuestionario.posicion_contacto,
    cuestionario.usa_scoring,
  );

  return (
    <section
      aria-labelledby="questionnaire-intro-title"
      className="questionnaire-intro"
      data-template-id={templateId}
    >
      <div className="questionnaire-intro-copy">
        <p className="questionnaire-intro-eyebrow">Antes de empezar</p>
        <h1 id="questionnaire-intro-title">{titulo}</h1>
        <p className="questionnaire-intro-description">{descripcion}</p>
        <div
          aria-label="Duración y cantidad"
          className="questionnaire-intro-facts"
          role="group"
        >
          <span>{cantidadPreguntas} preguntas</span>
          <span>~{minutosEstimados} min</span>
        </div>
        <button
          className="questionnaire-intro-button"
          onClick={onComenzar}
          type="button"
        >
          {textoBoton}
        </button>
        {requiereConsentimiento ? (
          <>
            <p className="questionnaire-intro-notice">
              Tus datos se tratarán según el{" "}
              <a
                href="#questionnaire-intro-privacy"
                onClick={() => setAvisoAbierto(true)}
              >
                aviso de privacidad.
              </a>
            </p>
            <details
              id="questionnaire-intro-privacy"
              onToggle={(evento) =>
                setAvisoAbierto(evento.currentTarget.open)
              }
              open={avisoAbierto}
            >
              <summary>Leer aviso de privacidad</summary>
              <p>{TEXTO_AVISO_PRIVACIDAD}</p>
            </details>
          </>
        ) : (
          <p className="questionnaire-intro-notice">
            Demostración: no se guardan datos.
          </p>
        )}
      </div>
      <aside
        aria-labelledby="questionnaire-intro-steps-title"
        className="questionnaire-intro-steps"
      >
        <h2 id="questionnaire-intro-steps-title">Qué vas a hacer</h2>
        <ol>
          {pasos.map((paso, indice) => (
            <li key={paso}>
              <span aria-hidden="true">{indice + 1}</span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
