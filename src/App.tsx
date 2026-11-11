import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  doc,
  getDocFromServer,
  serverTimestamp,
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
import PantallaSuscripcion from "./components/PantallaSuscripcion";
import PantallaInicioTemplate from "./components/PantallaInicioTemplate";
import PaginaRegistroEvento from "./components/PaginaRegistroEvento";
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
import {
  puedeBorrarBorrador,
  puedeEditarBorrador,
  puedePublicar,
  type PermisosCuestionarios,
  type RolCuestionarios,
} from "./lib/permisosCuestionarios";
import { esAdministradorEmpresa, normalizarRolMiembro } from "./admin/rolesMiembros";
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
  cambiarPublicacionCuestionario,
} from "./lib/publicacionCuestionarios";
import { useUsoCuestionarios } from "./hooks/useUsoCuestionarios";

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
const ID_TEMPLATE_REGISTRO_EVENTO = "demo-registro-evento-pagina-completa";
const PanelAdmin = lazy(() => import("./admin/AdminPanel"));

interface AccesoCuestionarios {
  correo: string;
  planId: string;
  rol: RolCuestionarios;
  permisos: PermisosCuestionarios;
  puedeEditar: boolean;
  puedePublicar: boolean;
  puedeDespublicar: boolean;
}

function puedeEditarCopia(
  acceso: AccesoCuestionarios | null,
  copia: DocumentoCuestionarioGuardado,
): boolean {
  return Boolean(
    acceso &&
    copia.estado === "borrador" &&
    puedeEditarBorrador(
      acceso.rol,
      acceso.permisos,
      copia.creadoPor,
      acceso.correo,
    ),
  );
}

function puedeBorrarCopia(
  acceso: AccesoCuestionarios | null,
  copia: DocumentoCuestionarioGuardado,
): boolean {
  return Boolean(
    acceso &&
    copia.estado === "borrador" &&
    puedeBorrarBorrador(
      acceso.rol,
      acceso.permisos,
      copia.creadoPor,
      acceso.correo,
    ),
  );
}

async function obtenerAccesoCuestionarios(
  usuario: User,
  empresaId: string,
): Promise<AccesoCuestionarios | null> {
  const database = db;
  const correo = usuario.email?.toLowerCase();
  if (!database || !usuario.emailVerified || !correo || !empresaId) {
    return null;
  }

  const plataforma = await getDocFromServer(
    doc(database, "plataformaAdmins", correo),
  );
  if (plataforma.exists()) {
    const empresa = await getDocFromServer(doc(database, "empresas", empresaId));
    const empresaActiva = empresa.exists() && empresa.data().estado === "activa";
    const datosEmpresa = empresa.data();
    return {
      correo,
      planId: typeof datosEmpresa?.planId === "string"
        ? datosEmpresa.planId
        : "inicial",
      rol: "plataforma",
      permisos: {
        editarCuestionarios: true,
        publicarCuestionarios: true,
      },
      puedeEditar: true,
      puedePublicar: empresaActiva,
      puedeDespublicar: empresaActiva,
    };
  }

  const membresia = await getDocFromServer(
    doc(database, "empresas", empresaId, "miembros", correo),
  );
  if (!membresia.exists() || membresia.data().estado !== "activo") {
    return null;
  }
  const empresa = await getDocFromServer(doc(database, "empresas", empresaId));
  const empresaActiva = empresa.exists() && empresa.data().estado === "activa";
  if (!empresaActiva) {
    return null;
  }
  const datos = membresia.data();
  const rol = normalizarRolMiembro(datos.rol);
  const permisos =
    typeof datos.permisos === "object" && datos.permisos !== null
      ? datos.permisos as PermisosCuestionarios
      : {};
  const administrador = esAdministradorEmpresa(rol);
  const datosEmpresa = empresa.data();
  const puedeEditar = administrador || permisos.editarCuestionarios === true;
  return {
    correo,
    planId: typeof datosEmpresa?.planId === "string"
      ? datosEmpresa.planId
      : "inicial",
    rol,
    permisos,
    puedeEditar,
    puedePublicar: (administrador ||
      (puedeEditar && puedePublicar(rol, permisos))) && empresaActiva,
    puedeDespublicar: (administrador ||
      (puedeEditar && puedePublicar(rol, permisos))) && empresaActiva,
  };
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
  const [accesoCuestionarios, setAccesoCuestionarios] =
    useState<AccesoCuestionarios | null>(null);
  const [usuarioSesion, setUsuarioSesion] = useState<User | null>(null);
  const [authListo, setAuthListo] = useState(false);
  const [copiasGuardadas, setCopiasGuardadas] = useState<
    DocumentoCuestionarioGuardado[]
  >([]);
  const [cargandoCopias, setCargandoCopias] = useState(false);
  const [errorBiblioteca, setErrorBiblioteca] = useState("");
  const usoCuestionarios = useUsoCuestionarios(
    db,
    accesoCuestionarios ? empresaActivaId : "",
    accesoCuestionarios?.planId ?? "inicial",
  );
  const estadoAppRef = useRef(estadoApp);
  const intentosGuardadosRef = useRef(new Set<string>());
  const { seleccion, bienvenidaCompletada, mostrarPlanes, envio } = estadoApp;
  const puedeCrearCopias = accesoCuestionarios?.puedeEditar === true;
  const alcanzoLimiteCuestionarios =
    usoCuestionarios.usados >= usoCuestionarios.limite;
  const publicacionBloqueada = usoCuestionarios.cargando ||
    Boolean(usoCuestionarios.error) ||
    alcanzoLimiteCuestionarios;
  const mensajePublicacionBloqueada = alcanzoLimiteCuestionarios
    ? "Alcanzaste el límite de tu plan: despublica uno o cambia de plan."
    : usoCuestionarios.error
    ? "No se pudo comprobar el cupo para publicar."
    : "Consultando el cupo de publicación…";
  const calculo = envio?.calculo ?? null;
  const resultadoValidacion = seleccion
    ? validarCuestionario(seleccion.configuracion)
    : null;
  const esTemplateRegistroEventoActual =
    !!seleccion &&
    typeof seleccion.configuracion === "object" &&
    seleccion.configuracion !== null &&
    "id" in seleccion.configuracion &&
    seleccion.configuracion.id === ID_TEMPLATE_REGISTRO_EVENTO;

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
      setAccesoCuestionarios(null);
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
        setAccesoCuestionarios(null);
        if (!usuario) {
          return;
        }
        void obtenerAccesoCuestionarios(usuario, empresaActivaId)
          .then((acceso) => {
            if (!cancelado && revisionActual === revision) {
              setAccesoCuestionarios(acceso);
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
        setAccesoCuestionarios(null);
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

  if (rutaActual === "/suscripcion") {
    return <PantallaSuscripcion />;
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
      let acceso: AccesoCuestionarios | null = null;
      try {
        acceso = usuario
          ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
          : null;
      } catch {
        setAccesoCuestionarios(null);
        throw new Error("No se pudo verificar tu permiso para crear copias.");
      }
      if (!usuario?.email || !acceso?.puedeEditar) {
        setAccesoCuestionarios(null);
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
      const acceso = usuario
        ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
        : null;
      if (!usuario || !acceso?.puedeEditar) {
        setAccesoCuestionarios(null);
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
      const acceso = usuario
        ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
        : null;
      if (!usuario || !acceso?.puedeEditar) {
        setAccesoCuestionarios(null);
        throw new Error("No tienes permiso para editar copias en esta empresa.");
      }
      const copia = await leerCuestionarioGuardado(empresaActivaId, id);
      if (!copia) {
        throw new Error("La copia guardada ya no existe.");
      }
      if (!puedeEditarCopia(acceso, copia)) {
        throw new Error(
          copia.estado === "publicado"
            ? "Despublica primero el cuestionario para editarlo."
            : "Solo puedes editar tus borradores; solicita a un administrador la edición de los demás.",
        );
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
    const usuario = auth?.currentUser;
    const acceso = usuario
      ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
      : null;
    if (!usuario || !acceso?.puedeEditar) {
      setAccesoCuestionarios(null);
      throw new Error("No tienes permiso para eliminar copias en esta empresa.");
    }
    const copia = await leerCuestionarioGuardado(empresaActivaId, id);
    if (!copia) {
      throw new Error("La copia guardada ya no existe.");
    }
    if (copia.estado === "publicado") {
      throw new Error("Despublica primero el cuestionario; los publicados no se eliminan.");
    }
    if (!puedeBorrarCopia(acceso, copia)) {
      throw new Error("Solo puedes eliminar tus borradores o los de tu empresa como administrador.");
    }
    if (!window.confirm("¿Eliminar esta copia guardada? Esta acción no se puede deshacer.")) {
      return;
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
      let acceso: AccesoCuestionarios | null = null;
      try {
        acceso = usuario
          ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
          : null;
      } catch {
        setAccesoCuestionarios(null);
        throw new Error("No se pudo verificar tu permiso para guardar cambios.");
      }
      if (!usuario?.email || !acceso?.puedeEditar) {
        setAccesoCuestionarios(null);
        throw new Error("No tienes permiso para editar copias en esta empresa.");
      }
      const copiaGuardada = actual.copiaGuardada ??
        copiasGuardadas.some((copia) => copia.id === actual.seleccion?.id);
      if (copiaGuardada) {
        const copiaExistente = await leerCuestionarioGuardado(
          empresaActivaId,
          actual.seleccion.id,
        );
        if (!copiaExistente) {
          throw new Error("La copia guardada ya no existe.");
        }
        if (!puedeEditarCopia(acceso, copiaExistente)) {
          throw new Error(
            copiaExistente.estado === "publicado"
              ? "Despublica primero el cuestionario para guardar cambios."
              : "Solo puedes editar tus borradores o los de tu empresa como administrador.",
          );
        }
      }
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

  async function crearVersionYPublicar(
    copia: DocumentoCuestionarioGuardado,
  ): Promise<string> {
    const usuario = auth?.currentUser;
    if (!usuario?.email || !usuario.emailVerified) {
      throw new Error("Inicia sesión con un correo verificado para publicar.");
    }
    await cambiarPublicacionCuestionario(
      "publicar",
      empresaActivaId,
      copia.id,
      await usuario.getIdToken(),
    );
    const actualizada = await leerCuestionarioGuardado(
      empresaActivaId,
      copia.id,
    );
    if (actualizada) {
      setCopiasGuardadas((copias) => [
        actualizada,
        ...copias.filter(({ id }) => id !== actualizada.id),
      ]);
    }
    return urlCopiaPublicada(empresaActivaId, copia.id);
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
    const acceso = usuario
      ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
      : null;
    if (!usuario?.email || !acceso?.puedePublicar || !acceso.puedeEditar) {
      throw new Error("No tienes permiso para publicar copias en esta empresa.");
    }
    const existente = await leerCuestionarioGuardado(
      empresaActivaId,
      seleccionActual.id,
    );
    if (!existente) {
      throw new Error("La copia guardada ya no existe.");
    }
    if (existente.estado === "publicado") {
      throw new Error("Despublica primero el cuestionario para editar el borrador.");
    }
    if (!puedeEditarCopia(acceso, existente)) {
      throw new Error("Solo puedes cambiar tus borradores o los de tu empresa como administrador.");
    }
    await actualizarCopiaPlantilla(nombre, configuracion, false);
    const guardada = await leerCuestionarioGuardado(
      empresaActivaId,
      seleccionActual.id,
    );
    if (!guardada) {
      throw new Error("La copia guardada ya no existe.");
    }
    const url = await crearVersionYPublicar(guardada);
    regresarBiblioteca();
    return url;
  }

  async function publicarCopiaDesdeBiblioteca(id: string): Promise<void> {
    const usuario = auth?.currentUser;
    const acceso = usuario
      ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
      : null;
    if (!usuario?.email || !acceso?.puedePublicar) {
      throw new Error("No tienes permiso para publicar cuestionarios en esta empresa.");
    }
    const copia = await leerCuestionarioGuardado(empresaActivaId, id);
    if (!copia || copia.estado !== "borrador") {
      throw new Error("Solo se pueden publicar borradores; despublica primero el cuestionario.");
    }
    await crearVersionYPublicar(copia);
  }

  async function despublicarCopiaPlantilla(id: string): Promise<void> {
    const usuario = auth?.currentUser;
    const acceso = usuario
      ? await obtenerAccesoCuestionarios(usuario, empresaActivaId)
      : null;
    if (!usuario || !acceso?.puedePublicar) {
      throw new Error("No tienes permiso para despublicar copias en esta empresa.");
    }
    const copia = await leerCuestionarioGuardado(empresaActivaId, id);
    if (!copia || copia.estado !== "publicado") {
      throw new Error("El cuestionario ya no está publicado.");
    }
    await cambiarPublicacionCuestionario(
      "despublicar",
      empresaActivaId,
      id,
      await usuario.getIdToken(),
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

  function reportarErrorBiblioteca(accion: string, error: unknown) {
    setErrorBiblioteca(
      error instanceof Error
        ? `No se pudo ${accion}: ${error.message}`
        : `No se pudo ${accion}.`,
    );
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
    const templateRegistroEvento = catalogoTemplates.find(({ id }) =>
      id.endsWith("/registro-evento-pagina-completa.json")
    );

    return (
      <Landing
        accesoCuenta={
          <AccesoCuenta authListo={authListo} usuario={usuarioSesion} />
        }
        onAbrirRegistroEvento={() => {
          if (!templateRegistroEvento) {
            return;
          }
          seleccionarCuestionario(
            templateRegistroEvento.id,
            templateRegistroEvento.metadata.nombre,
            templateRegistroEvento.configuracion,
          );
        }}
        onComenzar={abrirDiagnostico}
      />
    );
  }

  if (!seleccion) {
    const puedeVerTodasCopias = accesoCuestionarios?.rol === "admin" ||
      accesoCuestionarios?.rol === "propietario" ||
      accesoCuestionarios?.rol === "plataforma" ||
      accesoCuestionarios?.permisos.publicarCuestionarios === true;
    const copiasVisibles = puedeVerTodasCopias
      ? copiasGuardadas
      : copiasGuardadas.filter((copia) =>
        puedeEditarCopia(accesoCuestionarios, copia)
      );
    return (
      <BibliotecaTemplates
        accesoCuenta={
          <AccesoCuenta authListo={authListo} usuario={usuarioSesion} />
        }
        casosReferencia={casosReferencia}
        copiasGuardadas={copiasVisibles}
        cargandoCopias={cargandoCopias}
        errorBiblioteca={errorBiblioteca}
        onAbrirCopia={abrirCopiaGuardada}
        puedeEditarCopia={(copia) =>
          puedeEditarCopia(accesoCuestionarios, copia)
        }
        puedeBorrarCopia={(copia) =>
          puedeBorrarCopia(accesoCuestionarios, copia)
        }
        onCrearDesdeCero={puedeCrearCopias ? crearCuestionarioEnBlanco : undefined}
        onEliminarCopia={(id) =>
          void eliminarCopiaPlantilla(id).catch((error: unknown) =>
            reportarErrorBiblioteca("eliminar la copia", error)
          )
        }
        puedePublicar={accesoCuestionarios?.puedePublicar === true}
        onPublicarCopia={
          accesoCuestionarios?.puedePublicar
            ? (id) =>
              void publicarCopiaDesdeBiblioteca(id).catch((error: unknown) =>
                reportarErrorBiblioteca("publicar la copia", error)
              )
            : undefined
        }
        onDespublicarCopia={
          accesoCuestionarios?.puedeDespublicar
            ? (id) =>
              void despublicarCopiaPlantilla(id).catch((error: unknown) =>
                reportarErrorBiblioteca("despublicar la copia", error)
              )
            : undefined
        }
        onCrearCopia={puedeCrearCopias ? seleccionarCopiaPlantilla : undefined}
        onSeleccionar={seleccionarCuestionario}
        usoCuestionarios={
          accesoCuestionarios ? usoCuestionarios : undefined
        }
        templates={catalogoTemplates}
      />
    );
  }

  const navegacion = (
    <nav aria-label="Navegación del cuestionario" className="flow-navigation">
      {!esTemplateRegistroEventoActual && calculo?.estado === "ok" && (
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
      {!esTemplateRegistroEventoActual && (mostrarPlanes ? (
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
      ))}
      {seleccion && <span>{seleccion.nombre}</span>}
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
    const copiaSeleccionada = copiasGuardadas.find(
      ({ id }) => id === seleccion.id,
    );
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
    if (
      estadoApp.copiaGuardada &&
      copiaSeleccionada?.estado === "publicado"
    ) {
      return (
        <>
          {navegacion}
          <main className="validation-errors">
            <h1>Despublica primero</h1>
            <p>Un cuestionario publicado no se puede editar ni eliminar.</p>
            <button
              className="secondary-button"
              onClick={regresarBiblioteca}
              type="button"
            >
              Volver a la biblioteca
            </button>
          </main>
        </>
      );
    }
    if (
      estadoApp.copiaGuardada &&
      copiaSeleccionada &&
      !puedeEditarCopia(accesoCuestionarios, copiaSeleccionada)
    ) {
      return (
        <>
          {navegacion}
          <main className="validation-errors" role="alert">
            <h1>Sin permiso para editar este borrador</h1>
            <p>Solo puedes editar tus borradores. Pide ayuda a un administrador.</p>
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
          creadoPor={copiaSeleccionada?.creadoPor}
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
            estadoApp.copiaGuardada &&
              copiaSeleccionada &&
              puedeBorrarCopia(accesoCuestionarios, copiaSeleccionada)
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
          onPublicar={
            accesoCuestionarios?.puedePublicar
              ? (nombre, configuracion) =>
                publicarCopiaPlantilla(nombre, configuracion)
              : undefined
          }
          onDespublicar={
            accesoCuestionarios?.puedeDespublicar
              ? () => despublicarCopiaPlantilla(seleccion.id)
              : undefined
          }
          publicacionBloqueada={publicacionBloqueada}
          mensajePublicacionBloqueada={mensajePublicacionBloqueada}
        />
      </>
    );
  }

  const esTemplateRegistroEvento = esTemplateRegistroEventoActual;

  if (esTemplateRegistroEvento && !envio) {
    return (
      <>
        {navegacion}
        <PaginaRegistroEvento
          cuestionario={resultadoValidacion.data}
          onEnviar={(lead, calculoEnvio, respuestas, contenidoPersonalizado, errorPersonalizacion) => {
            navegar({
              ...estadoAppRef.current,
              envio: {
                lead,
                calculo: calculoEnvio,
                respuestas,
                contenidoPersonalizado,
                errorPersonalizacion,
              },
            });
          }}
          onVolver={regresarBiblioteca}
        />
      </>
    );
  }

  if (esTemplateRegistroEvento && envio) {
    return (
      <>
        {navegacion}
        <PaginaRegistroEvento
          cuestionario={resultadoValidacion.data}
          envioRealizado
          onEnviar={(lead, calculoEnvio, respuestas, contenidoPersonalizado, errorPersonalizacion) => {
            navegar({
              ...estadoAppRef.current,
              envio: {
                lead,
                calculo: calculoEnvio,
                respuestas,
                contenidoPersonalizado,
                errorPersonalizacion,
              },
            });
          }}
          onVolver={regresarBiblioteca}
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
          onComenzar={() =>
            navegar({
              ...estadoAppRef.current,
              origenIntroduccionTemplate: null,
              estadoCuestionario: {
                respuestas: {},
                datosContacto: null,
                consentimientoAceptado: false,
                indicePreguntaActual: 0,
                mostrarPreguntas:
                  resultadoValidacion.data.posicion_contacto !== "inicio",
                mostrarBienvenida: false,
              },
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
              void obtenerAccesoCuestionarios(usuario, empresaActivaId)
                .then((acceso) => {
                  if (!acceso?.puedeEditar) {
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
        personalizarResultados={
          resultadoValidacion.data.personalizar_resultado_con_ia ??
          seleccion.id === "diagnostico-inicial"
        }
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
