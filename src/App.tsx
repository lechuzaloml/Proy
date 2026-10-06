import { useState } from "react";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import casoNuevo from "../spec/Ejemplos/caso-nuevo.json";
import serEmpresario from "../spec/Ejemplos/ser-empresario-config.json";
import merkatics from "../spec/Ejemplos/merkatics-config.json";
import type { ResultadoCalculado } from "./logic/calcularResultado";
import type { Lead } from "./types/model";
import { validarCuestionario } from "./validation/validarCuestionario";

const configuraciones: Record<string, unknown> = {
  "caso-nuevo": casoNuevo,
  "ser-empresario": serEmpresario,
  merkatics,
};

export default function App() {
  const [casoSeleccionado, setCasoSeleccionado] = useState("caso-nuevo");
  const [landingCompletada, setLandingCompletada] = useState(false);
  const [envio, setEnvio] = useState<{
    lead: Lead;
    calculo: ResultadoCalculado;
  } | null>(null);
  const calculo = envio?.calculo ?? null;
  const resultadoValidacion = validarCuestionario(
    configuraciones[casoSeleccionado],
  );

  const selectorCasos = (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: "0.75rem",
        margin: "1rem auto",
        maxWidth: "760px",
        padding: "0 1rem",
      }}
    >
      <label htmlFor="selector-caso">Elegir cuestionario</label>
      <select
        id="selector-caso"
        onChange={(evento) => {
          setCasoSeleccionado(evento.target.value);
          setLandingCompletada(false);
          setEnvio(null);
        }}
        style={{ padding: "0.5rem" }}
        value={casoSeleccionado}
      >
        <option value="caso-nuevo">Caso nuevo</option>
        <option value="ser-empresario">Ser Empresario</option>
        <option value="merkatics">Merkatics</option>
      </select>
    </div>
  );

  if (!resultadoValidacion.valido) {
    return (
      <>
        {selectorCasos}
        <main className="validation-errors">
          <h1>No se pudo cargar el cuestionario</h1>
          <p>Corrige los siguientes errores de validación:</p>
          <ul>
            {resultadoValidacion.errores.map((error, indice) => (
              <li key={indice}>{error}</li>
            ))}
          </ul>
        </main>
      </>
    );
  }

  if (calculo?.estado === "error") {
    const mensaje =
      calculo.tipo === "sin_segmento"
        ? "No se encontró un segmento para el puntaje obtenido."
        : "No se pudo encontrar un resultado para el cuestionario.";

    return (
      <>
        {selectorCasos}
        <main className="validation-errors" role="alert">
          <h1>No se pudo determinar el resultado</h1>
          <p>{mensaje}</p>
        </main>
      </>
    );
  }

  if (calculo?.estado === "ok") {
    return (
      <>
        {selectorCasos}
        <PantallaResultado calculo={calculo} />
      </>
    );
  }

  if (!landingCompletada) {
    return (
      <>
        {selectorCasos}
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
      </>
    );
  }

  return (
    <>
      {selectorCasos}
      <RenderizadorCuestionario
        key={casoSeleccionado}
        cuestionario={resultadoValidacion.data}
        onEnvio={(lead, resultado) => setEnvio({ lead, calculo: resultado })}
      />
    </>
  );
}
