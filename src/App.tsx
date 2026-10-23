import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  updateDoc,
  writeBatch,
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
import CuestionarioPublico from "./components/CuestionarioPublico";
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
import {
  construirDocumentosCopia,
  construirDocumentosDiagnostico,
} from "./lib/construirDocumentosDiagnostico";
import { guardarDiagnostico } from "./lib/guardarDiagnostico";
import { CUESTIONARIO_ID, EMPRESA_ID, VERSION_ID } from "./config/firebaseDatos";
import {
  CLAVE_EMPRESA_ACTIVA,
  obtenerEmpresaActivaInicial,
} from "./config/empresaActiva";
import { crearCopiaPlantilla } from "./templates/crearCopiaPlantilla";
import { crearCuestionarioDesdeCero } from "./templates/crearCuestionarioDesdeCero";
import { auth } from "./lib/firebaseAuth";
import { db } from "./lib/firebase";
import { puedeCrearCopiasPlantilla } from "./lib/permisosPlantillas";
import {
  actualizarCuestionarioGuardado,
  crearCuestionarioGuardado,
  eliminarCuestionarioGuardado,
  leerCuestionarioGuardado,
  listarCuestionariosGuardados,
} from "./lib/cuestionariosGuardados";
import type { DocumentoCuestionarioGuardado } from "./lib/documentoCuestionario";
import {
  urlCopiaPublicada,
} from "./lib/publicacionCuestionarios";

interface SeleccionCuestionario {
  id: string;
  nombre: string;
  configuracion: unknown;
  desdeCero?: boolean;
}

interface EstadoAplicacion {
  historialId: number;
  idIntento: string | null;
  bienvenidaCompletada: boolean;
  seleccion: SeleccionCuestionario | null;
  editandoCopia: boolean;
  copiaGuardada: boolean;
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

async function puedeEditarCuestionarios(
  usuario: User,
  empresaId: string,
): Promise<boolean> {
  const database = db;
  const correo = usuario.email?.toLowerCase();
  if (!database || !usuario.emailVerified || !correo || !empresaId) {
    return false;
  }

  const plataforma = await getDocFromServer(
    doc(database, "plataformaAdmins", correo),
  );
  if (plataforma.exists()) {
    return puedeCrearCopiasPlantilla(
      { correo, correoVerificado: usuario.emailVerified },
      true,
      empresaId,
      [],
    );
  }

  const membresia = await getDocFromServer(
    doc(database, "empresas", empresaId, "miembros", correo),
  );
  return puedeCrearCopiasPlantilla(
    { correo, correoVerificado: usuario.emailVerified },
    false,
    empresaId,
    membresia.exists()
      ? [{ ...membresia.data(), empresaId }]
      : [],
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
    copiaGuardada: false,
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
  const [empresaActivaId, setEmpresaActivaId] = useState(
    obtenerEmpresaActivaInicial,
  );
  const [estadoApp, setEstadoApp] = useState(obtenerEstadoInicial);
  const [puedeCrearCopias, setPuedeCrearCopias] = useState(false);
  const [usuarioSesion, setUsuarioSesion] = useState<User | null>(null);
  const [authListo, setAuthListo] = useState(false);
  const [copiasGuardadas, setCopiasGuardadas] = useState<
    DocumentoCuestionarioGuardado[]
  >([]);
  const [cargandoCopias, setCargandoCopias] = useState(false);
  const [errorBiblioteca, setErrorBiblioteca] = useState("");
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
  const segmentosPublicos = rutaActual.split("/");
  const rutaPublicaCopia = rutaActual === "/c" ||
    rutaActual.startsWith("/c/");
  const empresaPublicaId = segmentosPublicos[2] ?? "";
  const cuestionarioPublicoId = segmentosPublicos[3] ?? "";
  const enlacePublicoValido = rutaPublicaCopia &&
    segmentosPublicos.length === 4 &&
    Boolean(empresaPublicaId && cuestionarioPublicoId);

  useEffect(() => {
    function actualizarEmpresaActiva(evento: StorageEvent) {
      if (
        evento.key === CLAVE_EMPRESA_ACTIVA &&
        !new URLSearchParams(window.location.search).has("empresa")
      ) {
        setEmpresaActivaId(evento.newValue?.trim() ?? "");
      }
    }
    window.addEventListener("storage", actualizarEmpresaActiva);
    return () => window.removeEventListener("storage", actualizarEmpresaActiva);
  }, []);
  useEffect(() => {
    if (rutaPublicaCopia) {
      setAuthListo(true);
      return;
    }
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
        void puedeEditarCuestionarios(usuario, empresaActivaId)
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
  }, [rutaActual, rutaPublicaCopia, empresaActivaId]);

  useEffect(() => {
    let cancelado = false;
    if (!puedeCrearCopias) {
      setCopiasGuardadas([]);
      setCargandoCopias(false);
      return;
    }

    setCargandoCopias(true);
    setErrorBiblioteca("");
    void listarCuestionariosGuardados(empresaActivaId)
      .then((copias) => {
        if (!cancelado) {
          setCopiasGuardadas(copias);
        }
      })
      .catch((error: unknown) => {
        if (!cancelado) {
          setCopiasGuardadas([]);
          setErrorBiblioteca(
            error instanceof Error
              ? `No se pudieron cargar las copias guardadas: ${error.message}`
              : "No se pudieron cargar las copias guardadas.",
          );
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoCopias(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [puedeCrearCopias, usuarioSesion?.uid, empresaActivaId]);

  if (rutaPublicaCopia) {
    return (
      <CuestionarioPublico
        empresaId={enlacePublicoValido ? empresaPublicaId : ""}
        cuestionarioId={enlacePublicoValido ? cuestionarioPublicoId : ""}
      />
    );
  }

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
    copiaGuardada = false,
    desdeCero = false,
  ) {
    navegar({
      ...estadoAppRef.current,
      bienvenidaCompletada: true,
      idIntento: id.startsWith("personalizado-")
        ? crypto.randomUUID()
        : null,
      seleccion: { id, nombre, configuracion, desdeCero },
      editandoCopia,
      copiaGuardada,
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
      let permitido = false;
      try {
        permitido = Boolean(
          usuario &&
          usuario.email &&
          await puedeEditarCuestionarios(usuario, empresaActivaId),
        );
      } catch {
        setPuedeCrearCopias(false);
        throw new Error("No se pudo verificar tu permiso para crear copias.");
      }
      if (!usuario?.email || !permitido) {
        setPuedeCrearCopias(false);
        throw new Error("No tienes permiso para crear copias en esta empresa.");
      }

      const copia = crearCopiaPlantilla(nombre, configuracion);
      setErrorBiblioteca("");
      seleccionarCuestionario(
        copia.id,
        copia.nombre,
        copia.configuracion,
        null,
        true,
      );
    } catch (error: unknown) {
      setErrorBiblioteca(
        error instanceof Error
          ? `No se pudo crear la copia: ${error.message}`
          : "No se pudo crear la copia.",
      );
    }
  }

  async function crearCuestionarioEnBlanco() {
    try {
      const usuario = auth?.currentUser;
      if (
        !usuario ||
        !await puedeEditarCuestionarios(usuario, empresaActivaId)
      ) {
        setPuedeCrearCopias(false);
        throw new Error("No tienes permiso para crear cuestionarios en esta empresa.");
      }
      const cuestionario = crearCuestionarioDesdeCero();
      setErrorBiblioteca("");
      seleccionarCuestionario(
        cuestionario.id,
        "Mi cuestionario",
        cuestionario,
        null,
        true,
        false,
        true,
      );
    } catch (error: unknown) {
      setErrorBiblioteca(
        error instanceof Error
          ? `No se pudo iniciar el cuestionario: ${error.message}`
          : "No se pudo iniciar el cuestionario.",
      );
    }
  }

  async function abrirCopiaGuardada(id: string) {
    try {
      const usuario = auth?.currentUser;
      if (!usuario || !await puedeEditarCuestionarios(usuario, empresaActivaId)) {
        setPuedeCrearCopias(false);
        throw new Error("No tienes permiso para editar copias en esta empresa.");
      }
      const copia = await leerCuestionarioGuardado(empresaActivaId, id);
      if (!copia) {
        throw new Error("La copia guardada ya no existe.");
      }
      seleccionarCuestionario(
        copia.id,
        copia.nombre,
        copia.configuracion,
        null,
        true,
        true,
      );
    } catch (error: unknown) {
      setErrorBiblioteca(
        error instanceof Error
          ? `No se pudo abrir la copia: ${error.message}`
          : "No se pudo abrir la copia.",
      );
    }
  }

  async function eliminarCopiaPlantilla(id: string) {
    if (!window.confirm("¿Eliminar esta copia guardada? Esta acción no se puede deshacer.")) {
      return;
    }
    const usuario = auth?.currentUser;
    let permitido = false;
    try {
      permitido = Boolean(
        usuario && await puedeEditarCuestionarios(usuario, empresaActivaId),
      );
    } catch {
      setPuedeCrearCopias(false);
      throw new Error("No se pudo verificar tu permiso para eliminar copias.");
    }
    if (!usuario || !permitido) {
      setPuedeCrearCopias(false);
      throw new Error("No tienes permiso para eliminar copias en esta empresa.");
    }
    await eliminarCuestionarioGuardado(empresaActivaId, id);
    setCopiasGuardadas((actuales) => actuales.filter((copia) => copia.id !== id));
    setErrorBiblioteca("");
    if (estadoAppRef.current.seleccion?.id === id) {
      regresarBiblioteca();
    }
  }

  function descartarCopiaNueva() {
    const actual = estadoAppRef.current;
    const siguiente: EstadoAplicacion = {
      ...actual,
      seleccion: null,
      editandoCopia: false,
      copiaGuardada: false,
      envio: null,
      mostrarPlanes: false,
      origenIntroduccionTemplate: null,
      estadoCuestionario: null,
    };
    window.history.replaceState(
      { ...(window.history.state ?? {}), [CLAVE_HISTORIAL]: siguiente },
      "",
    );
    estadoAppRef.current = siguiente;
    setEstadoApp(siguiente);
  }

  async function actualizarCopiaPlantilla(
    nombre: string,
    configuracion: unknown,
    previsualizar: boolean,
  ) {
    const actual = estadoAppRef.current;
    if (!actual.seleccion) {
      return;
    }

    if (!previsualizar) {
      const usuario = auth?.currentUser;
      let permitido = false;
      try {
        permitido = Boolean(
          usuario && await puedeEditarCuestionarios(usuario, empresaActivaId),
        );
      } catch {
        setPuedeCrearCopias(false);
        throw new Error("No se pudo verificar tu permiso para guardar cambios.");
      }
      if (!usuario?.email || !permitido) {
        setPuedeCrearCopias(false);
        throw new Error("No tienes permiso para editar copias en esta empresa.");
      }
      const copiaGuardada = actual.copiaGuardada ??
        copiasGuardadas.some((copia) => copia.id === actual.seleccion?.id);
      const guardada = copiaGuardada
        ? await actualizarCuestionarioGuardado(
          empresaActivaId,
          actual.seleccion.id,
          nombre,
          configuracion,
        )
        : await crearCuestionarioGuardado(
          empresaActivaId,
          actual.seleccion.id,
          nombre,
          configuracion,
          usuario.email.toLowerCase(),
        );
      configuracion = guardada.configuracion;
      setCopiasGuardadas((actuales) => [
        guardada,
        ...actuales.filter((copia) => copia.id !== guardada.id),
      ]);
    }
    const siguiente = {
      ...actual,
      seleccion: { ...actual.seleccion, nombre, configuracion },
      editandoCopia: !previsualizar,
      copiaGuardada: previsualizar ? actual.copiaGuardada : true,
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

  async function publicarCopiaPlantilla(
    nombre: string,
    configuracion: unknown,
  ): Promise<string> {
    const seleccionActual = estadoAppRef.current.seleccion;
    if (!seleccionActual || !seleccionActual.id.startsWith("personalizado-")) {
      throw new Error("Solo se pueden publicar copias guardadas.");
    }
    const usuario = auth?.currentUser;
    if (
      !usuario?.email ||
      !await puedeEditarCuestionarios(usuario, empresaActivaId)
    ) {
      setPuedeCrearCopias(false);
      throw new Error("No tienes permiso para publicar copias en esta empresa.");
    }
    await actualizarCopiaPlantilla(nombre, configuracion, false);
    const copiaGuardada = await leerCuestionarioGuardado(
      empresaActivaId,
      seleccionActual.id,
    );
    if (!copiaGuardada) {
      throw new Error("La copia guardada ya no existe.");
    }
    if (!db) {
      throw new Error("Firebase no está configurado.");
    }
    const cuestionarioRef = doc(
      db,
      "empresas",
      empresaActivaId,
      "cuestionarios",
      seleccionActual.id,
    );
    const versiones = await getDocsFromServer(
      collection(cuestionarioRef, "versiones"),
    );
    const numero = versiones.docs.reduce((mayor, version) => {
      const valor = version.data().numero;
      return typeof valor === "number" && Number.isFinite(valor)
        ? Math.max(mayor, valor)
        : mayor;
    }, 0) + 1;
    const versionId = crypto.randomUUID();
    const versionRef = doc(collection(cuestionarioRef, "versiones"), versionId);
    const batch = writeBatch(db);
    batch.set(versionRef, {
      numero,
      configuracion: copiaGuardada.configuracion,
      publicadaEn: serverTimestamp(),
      creadoPor: usuario.email.toLowerCase(),
    });
    batch.update(cuestionarioRef, {
      estado: "publicado",
      versionActualId: versionId,
      actualizadoEn: serverTimestamp(),
    });
    await batch.commit();
    const actualizada = await leerCuestionarioGuardado(
      empresaActivaId,
      seleccionActual.id,
    );
    if (actualizada) {
      setCopiasGuardadas((copias) => [
        actualizada,
        ...copias.filter(({ id }) => id !== actualizada.id),
      ]);
    }
    return urlCopiaPublicada(
      empresaActivaId,
      seleccionActual.id,
    );
  }

  async function despublicarCopiaPlantilla(id: string): Promise<void> {
    const usuario = auth?.currentUser;
    if (!usuario || !await puedeEditarCuestionarios(usuario, empresaActivaId)) {
      setPuedeCrearCopias(false);
      throw new Error("No tienes permiso para despublicar copias en esta empresa.");
    }
    if (!db) {
      throw new Error("Firebase no está configurado.");
    }
    await updateDoc(
      doc(db, "empresas", empresaActivaId, "cuestionarios", id),
      { estado: "borrador", actualizadoEn: serverTimestamp() },
    );
    const actualizada = await leerCuestionarioGuardado(empresaActivaId, id);
    if (actualizada) {
      setCopiasGuardadas((copias) => [
        actualizada,
        ...copias.filter(({ id: copiaId }) => copiaId !== actualizada.id),
      ]);
    }
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
        copiasGuardadas={copiasGuardadas}
        cargandoCopias={cargandoCopias}
        errorBiblioteca={errorBiblioteca}
        onAbrirCopia={abrirCopiaGuardada}
        onCrearDesdeCero={puedeCrearCopias ? crearCuestionarioEnBlanco : undefined}
        onEliminarCopia={
          puedeCrearCopias
            ? (id) => void eliminarCopiaPlantilla(id).catch((error: unknown) => {
              setErrorBiblioteca(
                error instanceof Error
                  ? `No se pudo eliminar la copia: ${error.message}`
                  : "No se pudo eliminar la copia.",
              );
            })
            : undefined
        }
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
    if (!puedeCrearCopias) {
      return (
        <>
          {navegacion}
          <main className="validation-errors" role="alert">
            <h1>Sin permiso para editar copias</h1>
            <p>Inicia sesión con una cuenta autorizada de Clear-IA.</p>
          </main>
        </>
      );
    }
    return (
      <>
        {navegacion}
        <EditorCuestionario
          id={seleccion.id}
          key={seleccion.id}
          copiaGuardada={estadoApp.copiaGuardada}
          desdeCero={seleccion.desdeCero}
          nombre={seleccion.nombre}
          cuestionario={resultadoValidacion.data}
          onGuardar={(nombre, cuestionario) =>
            actualizarCopiaPlantilla(nombre, cuestionario, false)
          }
          onPrevisualizar={(nombre, cuestionario) =>
            actualizarCopiaPlantilla(nombre, cuestionario, true)
          }
          onDescartar={
            estadoApp.copiaGuardada ? undefined : descartarCopiaNueva
          }
          onEliminar={
            estadoApp.copiaGuardada
              ? () => eliminarCopiaPlantilla(seleccion.id)
              : undefined
          }
          publicado={copiasGuardadas.find(
            ({ id }) => id === seleccion.id,
          )?.estado === "publicado"}
          urlPublica={(() => {
            const cuestionario = copiasGuardadas.find(
              ({ id }) => id === seleccion.id,
            );
            return cuestionario?.estado === "publicado"
              ? urlCopiaPublicada(empresaActivaId, seleccion.id)
              : undefined;
          })()}
          onPublicar={(nombre, configuracion) =>
            publicarCopiaPlantilla(nombre, configuracion)
          }
          onDespublicar={() => despublicarCopiaPlantilla(seleccion.id)}
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
                empresaId: EMPRESA_ID,
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
          } else if (
            seleccion.id.startsWith("personalizado-") &&
            resultadoValidacion.data.id === seleccion.id &&
            resultado.estado === "ok" &&
            estadoActual.idIntento &&
            estadoActual.estadoCuestionario?.consentimientoAceptado === true
          ) {
            const usuario = auth?.currentUser;
            const idIntento = estadoActual.idIntento;
            if (!usuario) {
              console.error(
                "Se requiere una sesión autorizada para guardar el envío de una copia.",
              );
            }
            if (
              usuario &&
              !intentosGuardadosRef.current.has(idIntento) &&
              !intentoMarcadoComoGuardado(idIntento)
            ) {
              intentosGuardadosRef.current.add(idIntento);
              void puedeEditarCuestionarios(usuario, empresaActivaId)
                .then((permitido) => {
                  if (!permitido) {
                    throw new Error(
                      "No tienes permiso para guardar envíos de copias en esta empresa.",
                    );
                  }
                  const documentos = construirDocumentosCopia({
                    empresaId: empresaActivaId,
                    id: idIntento,
                    contacto: lead,
                    cuestionario: resultadoValidacion.data,
                    respuestas,
                    calculo: resultado,
                    contenidoPersonalizado,
                    consentimientoAceptado: true,
                    fecha: serverTimestamp(),
                  });
                  return guardarDiagnostico(
                    empresaActivaId,
                    idIntento,
                    documentos,
                  );
                })
                .then((guardado) => {
                  if (guardado) {
                    marcarIntentoGuardado(idIntento);
                  } else {
                    intentosGuardadosRef.current.delete(idIntento);
                    console.error(
                      "No se pudo guardar el envío de la copia porque Firestore no está configurado.",
                    );
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
                    "No se pudo guardar el envío de la copia personalizada.",
                    error,
                  );
                });
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
        requiereConsentimiento={
          seleccion.id === "diagnostico-inicial" ||
          seleccion.id.startsWith("personalizado-")
        }
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
