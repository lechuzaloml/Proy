import type { ReactNode } from "react";
import type { Cuestionario } from "../types/model";
import type { MetadataTemplate } from "../templates/catalogo";
import {
  obtenerPresentacionTemplate,
  type IlustracionTemplate,
  type PresentacionTemplate,
} from "../config/presentacionTemplates";

interface PantallaInicioTemplateProps {
  templateId: string;
  template: MetadataTemplate;
  cuestionario: Cuestionario;
  presentacion?: PresentacionTemplate;
  onComenzar: () => void;
}

export function tienePortadaTemplate(templateId: string): boolean {
  const idsConPortada = new Set([
    "../../templates/forms/onboarding-para-agencia.json",
    "../../templates/quizzes/test-madurez-marketing-digital.json",
    "../../templates/assessments/diagnostico-preparacion-comercial.json",
    "../../templates/assessments/evaluacion-ciberseguridad.json",
    "../../templates/surveys/diagnostico-salud-financiera.json",
    "../../templates/assessments/evaluacion-liderazgo.json",
    "../../templates/assessments/diagnostico-madurez-tecnologica.json",
    "../../templates/events/registro-a-masterclass.json",
  ]);
  return idsConPortada.has(templateId);
}

function Ilustracion({
  ilustracion,
  nombre,
}: {
  ilustracion: IlustracionTemplate;
  nombre: string;
}) {
  if (ilustracion.tipo === "imagen") {
    return <img alt={ilustracion.alt} src={ilustracion.src} />;
  }

  let marca: ReactNode;
  switch (ilustracion.icono) {
    case "marketing":
      marca = (
        <>
          <path d="M54 145V112h20v33M86 145V91h20v54M118 145V72h20v73" />
          <path d="m55 87 28-16 22 8 30-29" />
          <path d="M124 50h11v11" />
        </>
      );
      break;
    case "comercial":
      marca = (
        <>
          <path d="M54 65h74a15 15 0 0 1 15 15v27a15 15 0 0 1-15 15H92l-19 15v-15h-19a15 15 0 0 1-15-15V80a15 15 0 0 1 15-15Z" />
          <path d="M103 135h37a15 15 0 0 0 15-15v-4" />
        </>
      );
      break;
    case "seguridad":
      marca = (
        <>
          <path d="m111 45 34 13v28c0 27-16 44-34 54-18-10-34-27-34-54V58l34-13Z" />
          <path d="m94 86 12 12 23-26" />
        </>
      );
      break;
    case "liderazgo":
      marca = (
        <>
          <circle cx="111" cy="69" r="15" />
          <circle cx="73" cy="83" r="11" />
          <circle cx="149" cy="83" r="11" />
          <path d="M80 139c4-21 14-32 31-32s27 11 31 32M48 139c3-17 11-25 24-25M150 114c13 0 21 8 24 25" />
        </>
      );
      break;
    case "aprendizaje":
      marca = (
        <>
          <path d="M111 66c-19-16-41-18-64-10v74c23-8 45-6 64 10 19-16 41-18 64-10V56c-23-8-45-6-64 10Z" />
          <path d="M111 66v74M65 77c13-3 25-1 35 5M65 96c13-3 25-1 35 5M157 77c-13-3-25-1-35 5M157 96c-13-3-25-1-35 5" />
        </>
      );
      break;
    case "digital":
      marca = (
        <>
          <rect height="24" rx="6" width="24" x="99" y="47" />
          <rect height="24" rx="6" width="24" x="54" y="114" />
          <rect height="24" rx="6" width="24" x="144" y="114" />
          <path d="M111 71v19M66 114V90h90v24" />
        </>
      );
      break;
    case "finanzas":
      marca = (
        <>
          <path d="M55 139h112M68 125V98h20v27M99 125V79h20v46M130 125V60h20v65" />
          <path d="m68 83 27-17 22 7 31-24" />
        </>
      );
      break;
  }

  return (
    <svg
      aria-label={nombre}
      className={`template-landing-svg template-landing-svg--${ilustracion.icono}`}
      fill="none"
      role="img"
      viewBox="0 0 240 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        className="template-landing-svg-frame"
        height="152"
        rx="12"
        width="190"
        x="25"
        y="24"
      />
      <g className="template-landing-svg-mark">{marca}</g>
    </svg>
  );
}

export default function PantallaInicioTemplate({
  templateId,
  template,
  cuestionario,
  presentacion = obtenerPresentacionTemplate(cuestionario.id),
  onComenzar,
}: PantallaInicioTemplateProps) {
  const cantidadPreguntas = cuestionario.preguntas.length;
  const minutosAproximados = Math.max(1, Math.ceil(cantidadPreguntas / 2));
  const clasePortada = `template-landing--${presentacion.portada}`;

  return (
    <main
      aria-labelledby="template-intro-title"
      className={`template-landing ${clasePortada}`}
      data-template-id={templateId}
    >
      <div className="template-landing-copy">
        <p className="template-landing-kicker">
          {template.formato} · {template.nicho}
        </p>
        <h1 id="template-intro-title">{template.nombre}</h1>
        <p className="template-landing-summary">{template.descripcion}</p>
        <div
          aria-label="Duración y cantidad"
          className="template-landing-facts"
          role="group"
        >
          <span>{cantidadPreguntas} preguntas</span>
          <span>Aprox. {minutosAproximados} min</span>
        </div>
        <p className="template-landing-outcome">
          {template.usa_scoring
            ? "Al finalizar, verás tu resultado."
            : "Al finalizar, verás una confirmación."}
        </p>
        <button
          className="template-landing-button"
          onClick={onComenzar}
          type="button"
        >
          Comenzar cuestionario
        </button>
        <p className="template-landing-demo">
          Demostración: no se guardan datos.
        </p>
      </div>
      <div
        className="template-landing-art"
        data-layout={presentacion.portada}
      >
        <Ilustracion ilustracion={presentacion.ilustracion} nombre={template.nombre} />
      </div>
    </main>
  );
}
