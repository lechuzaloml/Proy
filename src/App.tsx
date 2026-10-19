import { useEffect, useRef, useState } from "react";
import BibliotecaTemplates, {
  type CasoReferencia,
} from "./components/BibliotecaTemplates";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import PantallaRecomendacion from "./components/PantallaRecomendacion";
import PantallaPlanes from "./components/PantallaPlanes";
import PantallaInicioTemplate from "./components/PantallaInicioTemplate";
import { catalogoTemplates } from "./templates/catalogo";
import { recomendaciones } from "./config/recomendaciones";
import { obtenerPresentacionTemplate } from "./config/presentacionTemplates";
import diagnosticoInicial from "../templates/assessments/diagnostico-inicial.json";
import casoNuevo from "../spec/Ejemplos/caso-nuevo.json";
import serEmpresario from "../spec/Ejemplos/ser-empresario-config.json";
import merkatics from "../spec/Ejemplos/merkatics-config.json";
import type {
  RespuestasCuestionario,
  ResultadoCalculado,
} from "./logic/calcularResultado";
import type { Lead } from "./types/model";
import { validarCuestionario } from "./validation/validarCuestionario";
import type { EstadoFlujoCuestionario } from "./components/RenderizadorCuestionario";
import { serverTimestamp } from "firebase/firestore";
import { construirDocumentoLead } from "./lib/construirDocumentoLead";
import { guardarLead } from "./lib/guardarLead";

interface SeleccionCuestionario {
  id: string;
  nombre: string;
  configuracion: unknown;
}

interface EstadoAplicacion {
  historialId: number;
  idIntento: string | null;
  bienvenidaCompletada: boolean;
  seleccion: SeleccionCuestionario | null;
  mostrarPlanes: boolean;
  origenIntroduccionTemplate: "biblioteca" | "recomendacion" | null;
  envio: {
    lead: Lead;
    calculo: ResultadoCalculado;
    respuestas: RespuestasCuestionario;
    contenidoPersonalizado: string | null;
    errorPersonalizacion: string | null;
  } | null;
  estadoCuestionario: EstadoFlujoCuestionario | null;
}

interface EntradaHistorialAplicacion {
  clearIaNavigation?: EstadoAplicacion;
}

const CLAVE_HISTORIAL = "clearIaNavigation";

function obtenerEstadoInicial(): EstadoAplicacion {
  const entrada = window.history.state as EntradaHistorialAplicacion | null;
  if (entrada?.[CLAVE_HISTORIAL]) {
    return entrada[CLAVE_HISTORIAL];
  }

  const inicial: EstadoAplicacion = {
    historialId: 0,
    idIntento: null,
    bienvenidaCompletada: false,
    seleccion: null,
    mostrarPlanes: false,
    origenIntroduccionTemplate: null,
    envio: null,
    estadoCuestionario: null,
  };
  window.history.replaceState(
    { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: inicial },
    "",
  );
  return inicial;
}

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
  const [estadoApp, setEstadoApp] = useState(obtenerEstadoInicial);
  const estadoAppRef = useRef(estadoApp);
  const intentosGuardadosRef = useRef(new Set<string>());
  const { seleccion, bienvenidaCompletada, mostrarPlanes, envio } = estadoApp;
  const calculo = envio?.calculo ?? null;
  const resultadoValidacion = seleccion
    ? validarCuestionario(seleccion.configuracion)
    : null;

  useEffect(() => {
    function restaurarDesdeHistorial(evento: PopStateEvent) {
      const entrada = evento.state as EntradaHistorialAplicacion | null;
      const siguiente = entrada?.[CLAVE_HISTORIAL];
      if (siguiente) {
        estadoAppRef.current = siguiente;
        setEstadoApp(siguiente);
      }
    }

    window.addEventListener("popstate", restaurarDesdeHistorial);
    return () => window.removeEventListener("popstate", restaurarDesdeHistorial);
  }, []);

  function navegar(siguiente: EstadoAplicacion) {
    siguiente = {
      ...siguiente,
      historialId: estadoAppRef.current.historialId + 1,
    };
    window.history.pushState(
      { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: siguiente },
      "",
    );
    estadoAppRef.current = siguiente;
    setEstadoApp(siguiente);
  }

  function actualizarEstadoCuestionario(
    estadoCuestionario: EstadoFlujoCuestionario,
    modoHistorial: "reemplazar" | "avanzar" | "retroceder" = "reemplazar",
  ) {
    if (modoHistorial === "retroceder") {
      window.history.back();
      return;
    }

    const actual = estadoAppRef.current;
    if (!actual.seleccion || actual.envio) {
      return;
    }

    const siguiente = {
      ...actual,
      historialId: actual.historialId + (modoHistorial === "avanzar" ? 1 : 0),
      estadoCuestionario,
    };
    if (modoHistorial === "avanzar") {
      window.history.pushState(
        { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: siguiente },
        "",
      );
    } else {
      window.history.replaceState(
        { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: siguiente },
        "",
      );
    }
    estadoAppRef.current = siguiente;
    setEstadoApp(siguiente);
  }

  function seleccionarCuestionario(
    id: string,
    nombre: string,
    configuracion: unknown,
    origenIntroduccionTemplate: "biblioteca" | "recomendacion" | null = null,
  ) {
    navegar({
      ...estadoAppRef.current,
      bienvenidaCompletada: true,
      idIntento: null,
      seleccion: { id, nombre, configuracion },
      envio: null,
      mostrarPlanes: false,
      origenIntroduccionTemplate,
      estadoCuestionario: null,
    });
  }

  function regresarBiblioteca() {
    navegar({
      ...estadoAppRef.current,
      seleccion: null,
      envio: null,
      mostrarPlanes: false,
      origenIntroduccionTemplate: null,
      estadoCuestionario: null,
    });
  }

  function abrirDiagnostico() {
    navegar({
      ...estadoAppRef.current,
      bienvenidaCompletada: true,
      idIntento: crypto.randomUUID(),
      seleccion: {
        id: "diagnostico-inicial",
        nombre: "Diagnóstico inicial de crecimiento",
        configuracion: diagnosticoInicial,
      },
      envio: null,
      mostrarPlanes: false,
      origenIntroduccionTemplate: null,
      estadoCuestionario: null,
      historialId: estadoAppRef.current.historialId,
    });
  }

  if (!bienvenidaCompletada) {
    return <Landing onComenzar={abrirDiagnostico} />;
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
          onClick={() =>
            navegar({
              ...estadoAppRef.current,
              bienvenidaCompletada: false,
              seleccion: null,
              envio: null,
              mostrarPlanes: false,
              estadoCuestionario: null,
            })
          }
          type="button"
        >
          Ir al inicio
        </button>
      )}
      {mostrarPlanes ? (
        <button
          className="secondary-button"
          onClick={() => window.history.back()}
          type="button"
        >
          Volver a recomendación
        </button>
      ) : (
        <button
          className="secondary-button"
          onClick={
            estadoApp.origenIntroduccionTemplate
              ? () => window.history.back()
              : regresarBiblioteca
          }
          type="button"
        >
          {estadoApp.origenIntroduccionTemplate
            ? estadoApp.origenIntroduccionTemplate === "recomendacion"
              ? "Volver a recomendación"
              : "Volver a la biblioteca"
            : "Volver a la biblioteca"}
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

  if (estadoApp.origenIntroduccionTemplate) {
    const templateIntroduccion = catalogoTemplates.find(
      ({ id }) => id === seleccion.id,
    );
    if (!templateIntroduccion) {
      return (
        <>
          {navegacion}
          <main className="validation-errors" role="alert">
            <h1>No se encontró el template recomendado</h1>
            <p>Vuelve a la recomendación e inténtalo de nuevo.</p>
          </main>
        </>
      );
    }

    return (
      <>
        {navegacion}
        <PantallaInicioTemplate
          templateId={seleccion.id}
          template={templateIntroduccion.metadata}
          cuestionario={resultadoValidacion.data}
          presentacion={obtenerPresentacionTemplate(
            resultadoValidacion.data.id,
          )}
          onComenzar={() =>
            navegar({
              ...estadoAppRef.current,
              origenIntroduccionTemplate: null,
              estadoCuestionario: null,
              envio: null,
            })
          }
        />
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

  if (calculo?.estado === "ok" && envio) {
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
            contenido={
              envio.contenidoPersonalizado ?? calculo.resultado.contenido
            }
            errorPersonalizacion={envio.errorPersonalizacion}
            onVerTemplate={() =>
              seleccionarCuestionario(
                template.id,
                template.metadata.nombre,
                template.configuracion,
                "recomendacion",
              )
            }
            onVerPlanes={() =>
              navegar({ ...estadoAppRef.current, mostrarPlanes: true })
            }
            template={template.metadata}
          />
        </>
      );
    }

    return (
      <>
        {navegacion}
        <PantallaResultado
          calculo={calculo}
          cuestionario={resultadoValidacion.data}
          respuestas={envio.respuestas}
          contenidoPersonalizado={envio.contenidoPersonalizado}
          errorPersonalizacion={envio.errorPersonalizacion}
        />
      </>
    );
  }

  return (
    <>
      {navegacion}
      <RenderizadorCuestionario
        key={`${seleccion.id}-${estadoApp.historialId}`}
        cuestionario={resultadoValidacion.data}
        estadoInicial={estadoApp.estadoCuestionario}
        onEnvio={(
          lead,
          resultado,
          respuestas,
          contenidoPersonalizado,
          errorPersonalizacion,
        ) => {
          const estadoActual = estadoAppRef.current;
          if (
            seleccion.id === "diagnostico-inicial" &&
            resultado.estado === "ok" &&
            resultado.tipo === "segmentado" &&
            estadoActual.idIntento &&
            estadoActual.estadoCuestionario?.consentimientoAceptado === true
          ) {
            const recomendacion = recomendaciones[resultado.segmento];
            if (recomendacion) {
              const documento = construirDocumentoLead({
                contacto: lead,
                cuestionario: resultadoValidacion.data,
                respuestas,
                puntaje: resultado.puntajeTotal,
                segmento: resultado.segmento,
                templateRecomendadoId:
                  recomendacion.templateRecomendadoId,
                planRecomendado: recomendacion.plan.nombre,
                consentimientoAceptado: true,
                consentimientoFecha: serverTimestamp(),
                creadoEn: serverTimestamp(),
              });
              const idIntento = estadoActual.idIntento;
              if (!intentosGuardadosRef.current.has(idIntento)) {
                intentosGuardadosRef.current.add(idIntento);
                void guardarLead(idIntento, documento).catch(
                  (error: unknown) => {
                    intentosGuardadosRef.current.delete(idIntento);
                    console.error(
                      "No se pudo guardar el lead del diagnóstico.",
                      error,
                    );
                  },
                );
              }
            }
          }
          navegar({
            ...estadoActual,
            envio: {
              lead,
              calculo: resultado,
              respuestas,
              contenidoPersonalizado,
              errorPersonalizacion,
            },
          });
        }}
        onEstadoChange={actualizarEstadoCuestionario}
        requiereConsentimiento={seleccion.id === "diagnostico-inicial"}
        presentacion={
          seleccion.id === "diagnostico-inicial"
            ? undefined
            : obtenerPresentacionTemplate(resultadoValidacion.data.id)
        }
        unaPreguntaPorVista
      />
    </>
  );
}
