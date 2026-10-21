import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  collectionGroup,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
} from "firebase/firestore";
import BibliotecaTemplates, {
  type CasoReferencia,
} from "./components/BibliotecaTemplates";
import AccesoCuenta from "./components/AccesoCuenta";
import Landing from "./components/Landing";
import RenderizadorCuestionario from "./components/RenderizadorCuestionario";
import PantallaResultado from "./components/PantallaResultado";
import PantallaRecomendacion from "./components/PantallaRecomendacion";
import PantallaPlanes from "./components/PantallaPlanes";
import PantallaInicioTemplate from "./components/PantallaInicioTemplate";
import EditorCuestionario from "./components/EditorCuestionario";
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
import { construirDocumentosDiagnostico } from "./lib/construirDocumentosDiagnostico";
import { guardarDiagnostico } from "./lib/guardarDiagnostico";
import { CUESTIONARIO_ID, EMPRESA_ID, VERSION_ID } from "./config/firebaseDatos";
import { crearCopiaPlantilla } from "./templates/crearCopiaPlantilla";
import { auth } from "./lib/firebaseAuth";
import { db } from "./lib/firebase";
import { puedeCrearCopiasPlantilla } from "./lib/permisosPlantillas";

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
  editandoCopia: boolean;
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
const CLAVE_INTENTOS_GUARDADOS = "clearIaDiagnosticosGuardados";
const PanelAdmin = lazy(() => import("./admin/AdminPanel"));

async function puedeEditarCuestionarios(usuario: User): Promise<boolean> {
  const database = db;
  const correo = usuario.email?.toLowerCase();
  if (!database || !usuario.emailVerified || !correo) {
    return false;
  }

  const plataforma = await getDocFromServer(
    doc(database, "plataformaAdmins", correo),
  );
  if (plataforma.exists()) {
    return puedeCrearCopiasPlantilla(
      { correo, correoVerificado: usuario.emailVerified },
      true,
      [],
    );
  }

  const membresias = await getDocsFromServer(query(
    collectionGroup(database, "miembros"),
    where("correo", "==", correo),
  ));
  return puedeCrearCopiasPlantilla(
    { correo, correoVerificado: usuario.emailVerified },
    false,
    membresias.docs.map((membresia) => membresia.data()),
  );
}

function intentoMarcadoComoGuardado(id: string): boolean {
  try {
    const ids = JSON.parse(
      window.sessionStorage.getItem(CLAVE_INTENTOS_GUARDADOS) ?? "[]",
    ) as unknown;
    return Array.isArray(ids) && ids.includes(id);
  } catch (error) {
    console.error("No se pudo revisar la protección contra duplicados.", error);
    return false;
  }
}

function marcarIntentoGuardado(id: string) {
  try {
    const ids = JSON.parse(
      window.sessionStorage.getItem(CLAVE_INTENTOS_GUARDADOS) ?? "[]",
    ) as unknown;
    const guardados = Array.isArray(ids) ? ids : [];
    if (!guardados.includes(id)) {
      window.sessionStorage.setItem(
        CLAVE_INTENTOS_GUARDADOS,
        JSON.stringify([...guardados, id]),
      );
    }
  } catch (error) {
    console.error("No se pudo conservar la protección contra duplicados.", error);
  }
}

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
    editandoCopia: false,
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
  const [puedeCrearCopias, setPuedeCrearCopias] = useState(false);
  const [usuarioSesion, setUsuarioSesion] = useState<User | null>(null);
  const [authListo, setAuthListo] = useState(false);
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

  const rutaActual = window.location.pathname.replace(/\/+$/, "");
  useEffect(() => {
    if (rutaActual === "/admin" || rutaActual.startsWith("/admin/")) {
      return;
    }
    if (!auth || !db) {
      setUsuarioSesion(null);
      setAuthListo(true);
      setPuedeCrearCopias(false);
      return;
    }

    let cancelado = false;
    let revision = 0;
    const cancelarAuth = onAuthStateChanged(
      auth,
      (usuario) => {
        const revisionActual = ++revision;
        setUsuarioSesion(usuario);
        setAuthListo(true);
        setPuedeCrearCopias(false);
        if (!usuario) {
          return;
        }
        void puedeEditarCuestionarios(usuario)
          .then((permitido) => {
            if (!cancelado && revisionActual === revision) {
              setPuedeCrearCopias(permitido);
            }
          })
          .catch((error: unknown) => {
            if (!cancelado && revisionActual === revision) {
              console.error("No se pudo verificar el permiso para crear copias.", error);
            }
          });
      },
      (error) => {
        setUsuarioSesion(null);
        setAuthListo(true);
        setPuedeCrearCopias(false);
        console.error("No se pudo verificar la sesión para crear copias.", error);
      },
    );
    return () => {
      cancelado = true;
      revision += 1;
      cancelarAuth();
    };
  }, [rutaActual]);

  if (rutaActual === "/admin" || rutaActual.startsWith("/admin/")) {
    return (
      <Suspense fallback={<main className="admin-page">Cargando panel…</main>}>
        <PanelAdmin />
      </Suspense>
    );
  }

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
    editandoCopia = false,
  ) {
    navegar({
      ...estadoAppRef.current,
      bienvenidaCompletada: true,
      idIntento: null,
      seleccion: { id, nombre, configuracion },
      editandoCopia,
      envio: null,
      mostrarPlanes: false,
      origenIntroduccionTemplate,
      estadoCuestionario: null,
    });
  }

  async function seleccionarCopiaPlantilla(
    nombre: string,
    configuracion: unknown,
  ) {
    try {
      const usuario = auth?.currentUser;
      if (!usuario || !(await puedeEditarCuestionarios(usuario))) {
        setPuedeCrearCopias(false);
        return;
      }

      const copia = crearCopiaPlantilla(nombre, configuracion);
      seleccionarCuestionario(
        copia.id,
        copia.nombre,
        copia.configuracion,
        null,
        true,
      );
    } catch (error: unknown) {
      setPuedeCrearCopias(false);
      console.error("No se pudo verificar el permiso para crear la copia.", error);
    }
  }

  function actualizarCopiaPlantilla(
    nombre: string,
    configuracion: unknown,
    previsualizar: boolean,
  ) {
    const actual = estadoAppRef.current;
    if (!actual.seleccion) {
      return;
    }
    const siguiente = {
      ...actual,
      seleccion: { ...actual.seleccion, nombre, configuracion },
      editandoCopia: !previsualizar,
      estadoCuestionario: null,
      envio: null,
    };
    if (previsualizar) {
      navegar(siguiente);
      return;
    }
    window.history.replaceState(
      { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: siguiente },
      "",
    );
    estadoAppRef.current = siguiente;
    setEstadoApp(siguiente);
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
    return (
      <Landing
        accesoCuenta={
          <AccesoCuenta authListo={authListo} usuario={usuarioSesion} />
        }
        onComenzar={abrirDiagnostico}
      />
    );
  }

  if (!seleccion) {
    return (
      <BibliotecaTemplates
        accesoCuenta={
          <AccesoCuenta authListo={authListo} usuario={usuarioSesion} />
        }
        casosReferencia={casosReferencia}
        onCrearCopia={puedeCrearCopias ? seleccionarCopiaPlantilla : undefined}
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

  if (
    seleccion.id.startsWith("personalizado-") &&
    estadoApp.editandoCopia
  ) {
    return (
      <>
        {navegacion}
        <EditorCuestionario
          id={seleccion.id}
          key={seleccion.id}
          nombre={seleccion.nombre}
          cuestionario={resultadoValidacion.data}
          onGuardar={(nombre, cuestionario) =>
            actualizarCopiaPlantilla(nombre, cuestionario, false)
          }
          onPrevisualizar={(nombre, cuestionario) =>
            actualizarCopiaPlantilla(nombre, cuestionario, true)
          }
        />
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
            resultadoValidacion.data.id === CUESTIONARIO_ID &&
            resultado.estado === "ok" &&
            resultado.tipo === "segmentado" &&
            estadoActual.idIntento &&
            estadoActual.estadoCuestionario?.consentimientoAceptado === true
          ) {
            const recomendacion = recomendaciones[resultado.segmento];
            if (recomendacion) {
              const documentos = construirDocumentosDiagnostico({
                cuestionarioId: resultadoValidacion.data.id,
                versionId: VERSION_ID,
                id: estadoActual.idIntento,
                contacto: lead,
                cuestionario: resultadoValidacion.data,
                respuestas,
                puntajeTotal: resultado.puntajeTotal,
                segmento: resultado.segmento,
                templateRecomendadoId:
                  recomendacion.templateRecomendadoId,
                planRecomendadoId: recomendacion.plan.nombre
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, ""),
                consentimientoAceptado: true,
                fecha: serverTimestamp(),
                
              });
              const idIntento = estadoActual.idIntento;
              if (
                !intentosGuardadosRef.current.has(idIntento) &&
                !intentoMarcadoComoGuardado(idIntento)
              ) {
                intentosGuardadosRef.current.add(idIntento);
                void guardarDiagnostico(EMPRESA_ID, idIntento, documentos)
                  .then((guardado) => {
                    if (guardado) {
                      marcarIntentoGuardado(idIntento);
                    } else {
                      intentosGuardadosRef.current.delete(idIntento);
                    }
                  })
                  .catch((error: unknown) => {
                    intentosGuardadosRef.current.delete(idIntento);
                    const codigo =
                      typeof error === "object" &&
                      error !== null &&
                      "code" in error
                        ? error.code
                        : "";
                    if (codigo === "already-exists") {
                      marcarIntentoGuardado(idIntento);
                      return;
                    }
                    console.error(
                      "No se pudo guardar el diagnóstico del lead.",
                      error,
                    );
                  });
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
