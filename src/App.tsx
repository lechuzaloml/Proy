import { useState } from "react";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import casoNuevo from "../spec/Ejemplos/caso-nuevo.json";
import type { ResultadoCalculado } from "./logic/calcularResultado";
import { validarCuestionario } from "./validation/validarCuestionario";

const resultadoValidacion = validarCuestionario(casoNuevo);

export default function App() {
  const [calculo, setCalculo] = useState<ResultadoCalculado | null>(null);

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

  return (
    <RenderizadorCuestionario
      cuestionario={resultadoValidacion.data}
      onResultado={setCalculo}
    />
  );
}
