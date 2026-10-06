import { useState } from "react";
import BibliotecaTemplates, {
  type CasoReferencia,
} from "./components/BibliotecaTemplates";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import { catalogoTemplates } from "./templates/catalogo";
import casoNuevo from "../spec/Ejemplos/caso-nuevo.json";
import serEmpresario from "../spec/Ejemplos/ser-empresario-config.json";
import merkatics from "../spec/Ejemplos/merkatics-config.json";
import type { ResultadoCalculado } from "./logic/calcularResultado";
import type { Lead } from "./types/model";
import { validarCuestionario } from "./validation/validarCuestionario";

const casosReferencia: CasoReferencia[] = [
  {
    id: "ser-empresario",
    nombre: "Ser Empresario",
    descripcion: "Caso de referencia existente.",
    configuracion: serEmpresario,
  },
  {
    id: "merkatics",
    nombre: "Merkatics",
    descripcion: "Caso de referencia existente.",
    configuracion: merkatics,
  },
  {
    id: "caso-nuevo",
    nombre: "Caso nuevo",
    descripcion: "Caso de prueba existente, ficticio.",
    configuracion: casoNuevo,
  },
];

export default function App() {
  const [seleccion, setSeleccion] = useState<{
    id: string;
    nombre: string;
    configuracion: unknown;
  } | null>(null);
  const [landingCompletada, setLandingCompletada] = useState(false);
  const [envio, setEnvio] = useState<{
    lead: Lead;
    calculo: ResultadoCalculado;
  } | null>(null);
  const calculo = envio?.calculo ?? null;
  const resultadoValidacion = seleccion
    ? validarCuestionario(seleccion.configuracion)
    : null;

  function seleccionarCuestionario(
    id: string,
    nombre: string,
    configuracion: unknown,
  ) {
    setSeleccion({ id, nombre, configuracion });
    setLandingCompletada(false);
    setEnvio(null);
  }

  function regresarBiblioteca() {
    setSeleccion(null);
    setLandingCompletada(false);
    setEnvio(null);
  }

  if (!seleccion) {
    return (
      <BibliotecaTemplates
        casosReferencia={casosReferencia}
        onSeleccionar={seleccionarCuestionario}
        templates={catalogoTemplates}
      />
    );
  }

  const navegacion = (
    <nav aria-label="Navegación del cuestionario" className="flow-navigation">
      <button
        className="secondary-button"
        onClick={regresarBiblioteca}
        type="button"
      >
        Volver a la biblioteca
      </button>
      <span>{seleccion.nombre}</span>
    </nav>
  );

  if (!resultadoValidacion?.valido) {
    return (
      <>
        {navegacion}
        <main className="validation-errors">
          <h1>No se pudo cargar el cuestionario</h1>
          <p>Corrige los siguientes errores de validación:</p>
          <ul>
            {resultadoValidacion?.errores.map((error, indice) => (
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
        {navegacion}
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
        {navegacion}
        <PantallaResultado calculo={calculo} />
      </>
    );
  }

  if (!landingCompletada) {
    return (
      <>
        {navegacion}
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
      {navegacion}
      <RenderizadorCuestionario
        key={seleccion.id}
        cuestionario={resultadoValidacion.data}
        onEnvio={(lead, resultado) => setEnvio({ lead, calculo: resultado })}
      />
    </>
  );
}
