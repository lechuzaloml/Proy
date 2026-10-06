import { useState } from "react";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import casoNuevo from "../spec/Ejemplos/caso-nuevo.json";
import type { ResultadoCalculado } from "./logic/calcularResultado";
import type { Lead } from "./types/model";
import { validarCuestionario } from "./validation/validarCuestionario";

const resultadoValidacion = validarCuestionario(casoNuevo);

export default function App() {
  const [landingCompletada, setLandingCompletada] = useState(false);
  const [envio, setEnvio] = useState<{
    lead: Lead;
    calculo: ResultadoCalculado;
  } | null>(null);
  const calculo = envio?.calculo ?? null;

  if (!resultadoValidacion.valido) {
    return (
      <main className="validation-errors">
        <h1>No se pudo cargar el cuestionario</h1>
        <p>Corrige los siguientes errores de validación:</p>
        <ul>
          {resultadoValidacion.errores.map((error, indice) => (
            <li key={indice}>{error}</li>
          ))}
        </ul>
      </main>
    );
  }

  if (calculo?.estado === "error") {
    const mensaje =
      calculo.tipo === "sin_segmento"
        ? "No se encontró un segmento para el puntaje obtenido."
        : "No se pudo encontrar un resultado para el cuestionario.";

    return (
      <main className="validation-errors" role="alert">
        <h1>No se pudo determinar el resultado</h1>
        <p>{mensaje}</p>
      </main>
    );
  }

  if (calculo?.estado === "ok") {
    return <PantallaResultado calculo={calculo} />;
  }

  if (!landingCompletada) {
    return (
      <Landing
        descripcion={
          resultadoValidacion.data.landingDescripcion ??
          "Tus respuestas nos ayudarán a darte una recomendación personalizada."
        }
        onComenzar={() => setLandingCompletada(true)}
        titulo={
          resultadoValidacion.data.landingTitulo ??
          "Responde este cuestionario"
        }
      />
    );
  }

  return (
    <RenderizadorCuestionario
      cuestionario={resultadoValidacion.data}
      onEnvio={(lead, resultado) => setEnvio({ lead, calculo: resultado })}
    />
  );
}
