import { useState } from "react";
import BibliotecaTemplates, {
  type CasoReferencia,
} from "./components/BibliotecaTemplates";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import PantallaRecomendacion from "./components/PantallaRecomendacion";
import PantallaPlanes from "./components/PantallaPlanes";
import { catalogoTemplates } from "./templates/catalogo";
import { recomendaciones } from "./config/recomendaciones";
import diagnosticoInicial from "../templates/assessments/diagnostico-inicial.json";
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
  const [bienvenidaCompletada, setBienvenidaCompletada] = useState(false);
  const [mostrarPlanes, setMostrarPlanes] = useState(false);
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
    setEnvio(null);
    setMostrarPlanes(false);
  }

  function regresarBiblioteca() {
    setSeleccion(null);
    setEnvio(null);
    setMostrarPlanes(false);
  }

  function regresarInicio() {
    setSeleccion(null);
    setEnvio(null);
    setMostrarPlanes(false);
    setBienvenidaCompletada(false);
  }

  if (!bienvenidaCompletada) {
    return (
      <Landing
        onComenzar={() => {
          seleccionarCuestionario(
            "diagnostico-inicial",
            "Diagnóstico inicial de crecimiento",
            diagnosticoInicial,
          );
          setBienvenidaCompletada(true);
        }}
      />
    );
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
      {calculo?.estado === "ok" && (
        <button
          className="secondary-button"
          onClick={regresarInicio}
          type="button"
        >
          Ir al inicio
        </button>
      )}
      {mostrarPlanes ? (
        <button
          className="secondary-button"
          onClick={() => setMostrarPlanes(false)}
          type="button"
        >
          Volver a recomendación
        </button>
      ) : (
        <button
          className="secondary-button"
          onClick={regresarBiblioteca}
          type="button"
        >
          Volver a la biblioteca
        </button>
      )}
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
    if (seleccion.id === "diagnostico-inicial") {
      const recomendacion =
        calculo.tipo === "segmentado"
          ? recomendaciones[calculo.segmento]
          : undefined;
      const template = recomendacion
        ? catalogoTemplates.find(
            ({ id }) => id === recomendacion.templateRecomendadoId,
          )
        : undefined;

      if (!recomendacion || !template) {
        return (
          <>
            {navegacion}
            <main className="validation-errors" role="alert">
              <h1>No se pudo cargar la recomendación</h1>
              <p>
                No hay un plan o template configurado para el resultado
                calculado.
              </p>
            </main>
          </>
        );
      }

      if (mostrarPlanes) {
        return (
          <>
            {navegacion}
            <PantallaPlanes
              planRecomendadoNombre={recomendacion.plan.nombre}
              planes={Object.values(recomendaciones).map(({ plan }) => plan)}
            />
          </>
        );
      }

      return (
        <>
          {navegacion}
          <PantallaRecomendacion
            contenido={calculo.resultado.contenido}
            onVerTemplate={() =>
              seleccionarCuestionario(
                template.id,
                template.metadata.nombre,
                template.configuracion,
              )
            }
            onVerPlanes={() => setMostrarPlanes(true)}
            template={template.metadata}
          />
        </>
      );
    }

    return (
      <>
        {navegacion}
        <PantallaResultado calculo={calculo} />
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
        onRegresarInicio={
          seleccion.id === "diagnostico-inicial" ? regresarInicio : undefined
        }
        unaPreguntaPorVista
      />
    </>
  );
}
