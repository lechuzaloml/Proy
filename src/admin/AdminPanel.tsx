import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth } from "../lib/firebaseAuth";
import { db } from "../lib/firebase";
import { CLAVE_EMPRESA_ACTIVA } from "../config/empresaActiva";
import { CUESTIONARIO_ID } from "../config/firebaseDatos";
import {
  filtrarOrdenarLeads,
  type LeadParaLista,
  type OrdenLeads,
} from "./funcionesLeads";
import ConsolaPlataforma from "./ConsolaPlataforma";
import GestorMiembros from "./GestorMiembros";

type EstadoAcceso = "cargando" | "sin-sesion" | "revisando" | "denegado" | "listo";
type EstadoLead =
  | "nuevo"
  | "contactado"
  | "interesado"
  | "convertido"
  | "descartado";

interface PermisosMiembro {
  rol: string;
  verLeads: boolean;
  gestionarLeads: boolean;
  editarCuestionarios: boolean;
}

interface LeadAdmin extends LeadParaLista {
  datos: DocumentData;
}

interface EmpresaAccesible {
  id: string;
  nombre: string;
  estado: string;
  planId: string;
  permisos: PermisosMiembro;
}

interface Seguimiento {
  id: string;
  tipo: string;
  notas: string;
  creadoPor: string;
  creadoEn: unknown;
}

const ESTADOS: EstadoLead[] = [
  "nuevo",
  "contactado",
  "interesado",
  "convertido",
  "descartado",
];
const TIPOS_SEGUIMIENTO = ["llamada", "whatsapp", "correo", "nota"] as const;

function leerPermisos(datos: DocumentData): PermisosMiembro {
  const permisos =
    typeof datos.permisos === "object" && datos.permisos !== null
      ? datos.permisos as Record<string, unknown>
      : {};
  const rol = typeof datos.rol === "string" ? datos.rol : "";
  const esAdmin = rol === "admin";
  return {
    rol,
    verLeads: esAdmin || permisos.verLeads === true,
    gestionarLeads: esAdmin || permisos.gestionarLeads === true,
    editarCuestionarios: esAdmin || permisos.editarCuestionarios === true,
  };
}

function crearLeadAdmin(
  id: string,
  datos: DocumentData,
): LeadAdmin {
  return {
    id,
    datos,
    nombre: typeof datos.nombre === "string" ? datos.nombre : "",
    correo: typeof datos.correo === "string" ? datos.correo : "",
    estado: typeof datos.estado === "string" ? datos.estado : "",
    ...(typeof datos.ultimoSegmento === "string"
      ? { ultimoSegmento: datos.ultimoSegmento }
      : {}),
    ...(typeof datos.ultimoPorcentaje === "number"
      ? { ultimoPorcentaje: datos.ultimoPorcentaje }
      : {}),
    creadoEn: datos.creadoEn,
  };
}

async function agregarTitulosCuestionarios(
  database: Firestore,
  empresaId: string,
  leads: LeadAdmin[],
): Promise<LeadAdmin[]> {
  const diagnosticos = await Promise.all(leads.map(async (lead) => {
    const diagnosticoId = texto(lead.datos.ultimoDiagnosticoId);
    if (!diagnosticoId) {
      return [lead.id, ""] as const;
    }
    const snapshot = await getDoc(doc(
      database,
      "empresas",
      empresaId,
      "diagnosticos",
      diagnosticoId,
    ));
    return [
      lead.id,
      snapshot.exists() ? texto(snapshot.data().cuestionarioId) : "",
    ] as const;
  }));
  const cuestionariosPorLead = new Map(diagnosticos);
  const idsCuestionarios = [...new Set(
    diagnosticos.map(([, cuestionarioId]) => cuestionarioId)
      .filter(Boolean),
  )];
  const nombresCuestionarios = new Map<string, string>();

  await Promise.all(idsCuestionarios.map(async (cuestionarioId) => {
    if (cuestionarioId === CUESTIONARIO_ID) {
      nombresCuestionarios.set(
        cuestionarioId,
        "Diagnóstico inicial de crecimiento",
      );
      return;
    }
    try {
      const snapshot = await getDoc(doc(
        database,
        "empresas",
        empresaId,
        "cuestionarios",
        cuestionarioId,
      ));
      if (!snapshot.exists()) {
        nombresCuestionarios.set(cuestionarioId, cuestionarioId);
        return;
      }
      const datos = snapshot.data();
      const configuracion = datos.configuracion as DocumentData | undefined;
      nombresCuestionarios.set(
        cuestionarioId,
        texto(datos.nombre) || texto(configuracion?.cliente) || cuestionarioId,
      );
    } catch (error: unknown) {
      const codigo = typeof error === "object" && error !== null &&
          "code" in error
        ? error.code
        : "";
      if (codigo !== "permission-denied") {
        throw error;
      }
      console.warn(
        `No se pudo leer el título del cuestionario "${cuestionarioId}" con las reglas actuales.`,
      );
      nombresCuestionarios.set(cuestionarioId, cuestionarioId);
    }
  }));

  return leads.map((lead) => {
    const cuestionarioId = cuestionariosPorLead.get(lead.id) ?? "";
    return {
      ...lead,
      ...(cuestionarioId
        ? {
            cuestionarioId,
            cuestionarioNombre:
              nombresCuestionarios.get(cuestionarioId) ?? cuestionarioId,
          }
        : {}),
    };
  });
}

function fechaLegible(valor: unknown): string {
  if (valor instanceof Date) {
    return valor.toLocaleString();
  }
  if (
    typeof valor === "object" &&
    valor !== null &&
    "toDate" in valor &&
    typeof valor.toDate === "function"
  ) {
    return valor.toDate().toLocaleString();
  }
  return "No disponible";
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

export default function AdminPanel() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [authListo, setAuthListo] = useState(false);
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso>("cargando");
  const [empresas, setEmpresas] = useState<EmpresaAccesible[]>([]);
  const [empresaIdActiva, setEmpresaIdActiva] = useState("");
  const [esPlataforma, setEsPlataforma] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<LeadAdmin[]>([]);
  const [leadSeleccionado, setLeadSeleccionado] = useState<LeadAdmin | null>(null);
  const [cargandoLeads, setCargandoLeads] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [cursor, setCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [orden, setOrden] = useState<OrdenLeads>("fecha");
  const [busqueda, setBusqueda] = useState("");
  const [filtroSegmento, setFiltroSegmento] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCuestionario, setFiltroCuestionario] = useState("");
  const rutaPlataforma =
    window.location.pathname.replace(/\/+$/, "") === "/admin/plataforma";
  const empresaActiva =
    empresas.find(({ id }) => id === empresaIdActiva) ?? null;

  useEffect(() => {
    if (!auth) {
      setAuthListo(true);
      setEstadoAcceso("sin-sesion");
      return;
    }

    return onAuthStateChanged(
      auth,
      (siguienteUsuario) => {
        setUsuario(siguienteUsuario);
        setAuthListo(true);
        setError("");
        setEstadoAcceso(siguienteUsuario ? "revisando" : "sin-sesion");
      },
      (authError) => {
        setAuthListo(true);
        setError(`No se pudo verificar la sesión: ${authError.message}`);
      },
    );
  }, []);

  useEffect(() => {
    const database = db;
    if (!usuario || !database || !usuario.email) {
      setEsPlataforma(false);
      if (usuario && !database) {
        setEstadoAcceso("denegado");
      } else if (!usuario && authListo) {
        setEstadoAcceso("sin-sesion");
      }
      return;
    }

    let cancelado = false;
    const correo = usuario.email.toLowerCase();
    setEstadoAcceso("revisando");
    setError("");
    void Promise.all([
      getDoc(doc(database, "plataformaAdmins", correo)),
      getDocs(query(
        collectionGroup(database, "miembros"),
        where("correo", "==", correo),
      )),
    ])
      .then(async ([plataformaSnapshot, membresiasSnapshot]) => {
        if (cancelado) {
          return;
        }
        const plataforma = plataformaSnapshot.exists();
        setEsPlataforma(plataforma);
        const membresiasActivas = membresiasSnapshot.docs.filter(
          (snapshot) =>
            snapshot.data().estado === "activo" &&
            snapshot.data().correo === correo,
        );
        const empresasMembresia = await Promise.all(
          membresiasActivas.map(async (membresia) => {
            const referenciaEmpresa = membresia.ref.parent.parent;
            if (!referenciaEmpresa) {
              return null;
            }
            const empresaSnapshot = await getDoc(referenciaEmpresa);
            if (!empresaSnapshot.exists()) {
              return null;
            }
            const datosEmpresa = empresaSnapshot.data();
            return {
              id: empresaSnapshot.id,
              nombre: typeof datosEmpresa.nombre === "string"
                ? datosEmpresa.nombre
                : empresaSnapshot.id,
              estado: typeof datosEmpresa.estado === "string"
                ? datosEmpresa.estado
                : "desconocido",
              planId: typeof datosEmpresa.planId === "string"
                ? datosEmpresa.planId
                : "interno",
              permisos: leerPermisos(membresia.data()),
            } satisfies EmpresaAccesible;
          }),
        );
        let accesibles = empresasMembresia.filter(
          (empresa): empresa is EmpresaAccesible => empresa !== null,
        );
        if (plataforma) {
          const empresasSnapshot = await getDocs(
            collection(database, "empresas"),
          );
          const membresiasPorId = new Map(
            accesibles.map((empresa) => [empresa.id, empresa]),
          );
          accesibles = empresasSnapshot.docs.map((snapshot) => {
            const existente = membresiasPorId.get(snapshot.id);
            const datosEmpresa = snapshot.data();
            return {
              id: snapshot.id,
              nombre: typeof datosEmpresa.nombre === "string"
                ? datosEmpresa.nombre
                : snapshot.id,
              estado: typeof datosEmpresa.estado === "string"
                ? datosEmpresa.estado
                : "desconocido",
              planId: typeof datosEmpresa.planId === "string"
                ? datosEmpresa.planId
                : "interno",
              permisos: existente?.permisos ?? {
                rol: "admin",
                verLeads: true,
                gestionarLeads: true,
                editarCuestionarios: true,
              },
            };
          });
        }
        if (cancelado) {
          return;
        }
        accesibles.sort((primero, segundo) =>
          primero.nombre.localeCompare(segundo.nombre),
        );
        setEmpresas(accesibles);
        setEmpresaIdActiva((actual) =>
          accesibles.some(({ id }) => id === actual)
            ? actual
            : accesibles.find(({ id }) =>
                id === window.localStorage.getItem(CLAVE_EMPRESA_ACTIVA),
              )?.id ?? (accesibles.length === 1 ? accesibles[0].id : ""),
        );
        if (plataforma) {
          setEstadoAcceso("listo");
        } else if (accesibles.length === 0) {
          setEstadoAcceso("denegado");
        } else {
          setEstadoAcceso("listo");
        }
      })
      .catch((consultaError: unknown) => {
        if (!cancelado) {
          setError(
            consultaError instanceof Error
              ? consultaError.message
              : "No se pudo verificar el acceso.",
          );
          setEstadoAcceso("denegado");
        }
      });

    return () => {
      cancelado = true;
    };
  }, [usuario, authListo]);

  useEffect(() => {
    if (empresaIdActiva) {
      window.localStorage.setItem(CLAVE_EMPRESA_ACTIVA, empresaIdActiva);
    }
  }, [empresaIdActiva]);

  const puedeVerLeads = Boolean(
    esPlataforma ||
      empresaActiva?.permisos.verLeads ||
      empresaActiva?.permisos.gestionarLeads,
  );
  const puedeGestionarLeads = Boolean(
    esPlataforma || empresaActiva?.permisos.gestionarLeads,
  );
  const puedeEliminar = Boolean(
    esPlataforma || empresaActiva?.permisos.rol === "admin",
  );
  const puedeGestionarMiembros = Boolean(
    esPlataforma || empresaActiva?.permisos.rol === "admin",
  );

  useEffect(() => {
    const database = db;
    if (
      estadoAcceso !== "listo" ||
      !puedeVerLeads ||
      !empresaIdActiva ||
      !database
    ) {
      setLeads([]);
      setCursor(null);
      setHayMas(false);
      return;
    }

    let cancelado = false;
    setCargandoLeads(true);
    setError("");
    const ordenCampo = orden === "fecha" ? "creadoEn" : "ultimoPorcentaje";
    const consulta = query(
      collection(database, "empresas", empresaIdActiva, "leads"),
      orderBy(ordenCampo, "desc"),
      limit(100),
    );
    void getDocs(consulta)
      .then(async (resultado) => {
        if (cancelado) {
          return;
        }
        const leadsCargados = resultado.docs.map((snapshot) =>
          crearLeadAdmin(snapshot.id, snapshot.data()),
        );
        const leadsConCuestionario = await agregarTitulosCuestionarios(
          database,
          empresaIdActiva,
          leadsCargados,
        );
        if (cancelado) {
          return;
        }
        setLeads(leadsConCuestionario);
        setCursor(resultado.docs.at(-1) ?? null);
        setHayMas(resultado.docs.length === 100);
      })
      .catch((consultaError: unknown) => {
        if (!cancelado) {
          setError(
            consultaError instanceof Error
              ? consultaError.message
              : "No se pudo cargar la lista de leads.",
          );
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoLeads(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [estadoAcceso, puedeVerLeads, empresaIdActiva, orden]);

  const cargarMas = useCallback(async () => {
    const database = db;
    if (!database || !cursor || !puedeVerLeads || !empresaIdActiva) {
      return;
    }
    setCargandoMas(true);
    setError("");
    try {
      const ordenCampo = orden === "fecha" ? "creadoEn" : "ultimoPorcentaje";
      const consulta = query(
        collection(database, "empresas", empresaIdActiva, "leads"),
        orderBy(ordenCampo, "desc"),
        startAfter(cursor),
        limit(100),
      );
      const resultado = await getDocs(consulta);
      const leadsCargados = resultado.docs
        .filter((snapshot) => !leads.some(({ id }) => id === snapshot.id))
        .map((snapshot) => crearLeadAdmin(snapshot.id, snapshot.data()));
      const leadsConCuestionario = await agregarTitulosCuestionarios(
        database,
        empresaIdActiva,
        leadsCargados,
      );
      setLeads((actuales) => [...actuales, ...leadsConCuestionario]);
      setCursor(resultado.docs.at(-1) ?? cursor);
      setHayMas(resultado.docs.length === 100);
    } catch (consultaError) {
      setError(
        consultaError instanceof Error
          ? consultaError.message
          : "No se pudieron cargar más leads.",
      );
    } finally {
      setCargandoMas(false);
    }
  }, [cursor, orden, puedeVerLeads, empresaIdActiva, leads]);

  const leadsVisibles = useMemo(
    () => filtrarOrdenarLeads(leads, {
      busqueda,
      segmento: filtroSegmento,
      estado: filtroEstado,
      cuestionario: filtroCuestionario,
      orden,
    }),
    [leads, busqueda, filtroSegmento, filtroEstado, filtroCuestionario, orden],
  );
  const cuestionarios = useMemo(
    () => [...new Map(leads.flatMap((lead) =>
      lead.cuestionarioId
        ? [[
            lead.cuestionarioId,
            lead.cuestionarioNombre ?? lead.cuestionarioId,
          ] as const]
        : [],
    )).entries()].sort((primero, segundo) =>
      primero[1].localeCompare(segundo[1]),
    ),
    [leads],
  );
  const segmentos = useMemo(
    () => [...new Set(leads.map(({ ultimoSegmento }) => ultimoSegmento)
      .filter((segmento): segmento is string => Boolean(segmento)))].sort(),
    [leads],
  );

  async function iniciarSesion() {
    if (!auth) {
      setError("Configura las variables de Firebase para iniciar sesión.");
      return;
    }
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "No se pudo iniciar sesión con Google.",
      );
    }
  }

  async function cerrarSesion() {
    if (!auth) {
      return;
    }
    try {
      await signOut(auth);
      setLeadSeleccionado(null);
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "No se pudo cerrar sesión.",
      );
    }
  }

  function actualizarLeadActual(id: string, datos: DocumentData) {
    const existente = leads.find((actual) => actual.id === id) ??
      leadSeleccionado;
    const lead: LeadAdmin = {
      ...crearLeadAdmin(id, datos),
      ...(existente?.cuestionarioId
        ? {
            cuestionarioId: existente.cuestionarioId,
            cuestionarioNombre: existente.cuestionarioNombre,
          }
        : {}),
    };
    setLeads((actuales) =>
      actuales.map((actual) => actual.id === id ? lead : actual),
    );
    setLeadSeleccionado(lead);
  }

  function eliminarLeadDeLista(id: string) {
    setLeads((actuales) => actuales.filter((lead) => lead.id !== id));
    setLeadSeleccionado(null);
  }

  if (!authListo || estadoAcceso === "cargando" || estadoAcceso === "revisando") {
    return (
      <main className="admin-page">
        <p role="status">Verificando acceso…</p>
      </main>
    );
  }

  if (!auth) {
    return (
      <main className="admin-page">
        <h1>Administración de Clear-IA</h1>
        <p>Configura las variables de Firebase para habilitar el panel.</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="admin-page admin-login">
        <h1>Administración de Clear-IA</h1>
        <p>Inicia sesión con tu cuenta de Google para continuar.</p>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="submit-button" onClick={() => void iniciarSesion()}>
          Iniciar sesión con Google
        </button>
      </main>
    );
  }

  if (rutaPlataforma) {
    if (!esPlataforma) {
      return (
        <main className="admin-page">
          <p>Esta cuenta no tiene acceso.</p>
        </main>
      );
    }
    return <ConsolaPlataforma onVolver={() => window.location.assign("/admin")} />;
  }

  if (
    estadoAcceso !== "listo" ||
    (!esPlataforma && empresas.length === 0)
  ) {
    return (
      <main className="admin-page">
        <header className="admin-header">
          <h1>Administración de Clear-IA</h1>
          <button className="secondary-button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </header>
        {error ? (
          <p className="admin-error" role="alert">{error}</p>
        ) : (
          <p role="status">Esta cuenta no tiene acceso.</p>
        )}
      </main>
    );
  }

  if (!empresaActiva) {
    return (
      <main className="admin-page">
        <header className="admin-header">
          <div>
            <h1>Panel de administración</h1>
            <p>{usuario.email}</p>
          </div>
          <button className="secondary-button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </header>
        {empresas.length > 1 ? (
          <section className="admin-card">
            <h2>Selecciona una empresa</h2>
            <ul className="admin-company-picker">
              {empresas.map((empresa) => (
                <li key={empresa.id}>
                  <button
                    className="admin-lead-link"
                    onClick={() => setEmpresaIdActiva(empresa.id)}
                  >
                    {empresa.nombre}
                  </button>
                  <span>{empresa.estado} · {empresa.planId} · {empresa.id}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p>No hay empresas disponibles para esta cuenta.</p>
        )}
        {esPlataforma && (
          <a className="secondary-button admin-platform-link" href="/admin/plataforma">
            Abrir consola de plataforma
          </a>
        )}
      </main>
    );
  }

  if (!puedeVerLeads) {
    return (
      <main className="admin-page">
        <header className="admin-header">
          <h1>Administración de Clear-IA</h1>
          <button className="secondary-button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </header>
        <p>Esta cuenta no tiene acceso.</p>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">{empresaActiva.nombre}</p>
          <h1>Panel de leads</h1>
          <p>{usuario.email}</p>
          <p className="admin-company-status">
            Empresa: {empresaActiva.nombre} · {empresaActiva.estado} ·{" "}
            {empresaActiva.planId}
          </p>
          {empresas.length > 1 && (
            <label className="admin-company-select">
              Cambiar empresa
              <select
                onChange={(evento) => {
                  setLeadSeleccionado(null);
                  setEmpresaIdActiva(evento.target.value);
                  setCursor(null);
                  setLeads([]);
                  setFiltroCuestionario("");
                }}
                value={empresaIdActiva}
              >
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre} · {empresa.estado}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="admin-header-actions">
          {esPlataforma && (
            <a className="secondary-button" href="/admin/plataforma">
              Consola de plataforma
            </a>
          )}
          <button className="secondary-button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {leadSeleccionado ? (
        <DetalleLead
          empresaId={empresaIdActiva}
          lead={leadSeleccionado}
          puedeEliminar={puedeEliminar}
          puedeGestionar={puedeGestionarLeads}
          usuario={usuario}
          onActualizar={actualizarLeadActual}
          onCerrar={() => setLeadSeleccionado(null)}
          onEliminado={eliminarLeadDeLista}
        />
      ) : (
        <>
          <section aria-label="Filtros de leads" className="admin-filters">
            <label>
              Buscar nombre o correo
              <input
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar…"
                type="search"
                value={busqueda}
              />
            </label>
            <label>
              Segmento
              <select
                onChange={(evento) => setFiltroSegmento(evento.target.value)}
                value={filtroSegmento}
              >
                <option value="">Todos</option>
                {segmentos.map((segmento) => (
                  <option key={segmento} value={segmento}>{segmento}</option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                onChange={(evento) => setFiltroEstado(evento.target.value)}
                value={filtroEstado}
              >
                <option value="">Todos</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </label>
            <label>
              Cuestionario
              <select
                onChange={(evento) =>
                  setFiltroCuestionario(evento.target.value)
                }
                value={filtroCuestionario}
              >
                <option value="">Todos</option>
                {cuestionarios.map(([id, nombre]) => (
                  <option key={id} value={id}>{nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Ordenar por
              <select
                onChange={(evento) => setOrden(evento.target.value as OrdenLeads)}
                value={orden}
              >
                <option value="fecha">Fecha</option>
                <option value="madurez">Madurez del proceso</option>
              </select>
            </label>
          </section>

          {cargandoLeads ? (
            <p role="status">Cargando leads…</p>
          ) : leadsVisibles.length === 0 ? (
            <p className="admin-empty">No hay leads que coincidan con los filtros.</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Cuestionario</th>
                    <th>Estado</th>
                    <th>Segmento</th>
                    <th>Madurez del proceso</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsVisibles.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <button
                          className="admin-lead-link"
                          onClick={() => setLeadSeleccionado(
                            leads.find(({ id }) => id === lead.id) ?? null,
                          )}
                        >
                          {lead.nombre || "Sin nombre"}
                        </button>
                      </td>
                      <td>{lead.correo}</td>
                      <td>{lead.cuestionarioNombre ?? "—"}</td>
                      <td>{lead.estado}</td>
                      <td>{lead.ultimoSegmento ?? "—"}</td>
                      <td>
                        {lead.ultimoPorcentaje === undefined
                          ? "—"
                          : `${lead.ultimoPorcentaje}%`}
                      </td>
                      <td>{fechaLegible(lead.creadoEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hayMas && (
            <button
              className="secondary-button admin-load-more"
              disabled={cargandoMas}
              onClick={() => void cargarMas()}
            >
              {cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          )}
        </>
      )}
      {puedeGestionarMiembros && (
        <GestorMiembros
          empresaId={empresaIdActiva}
          empresaNombre={empresaActiva.nombre}
        />
      )}
    </main>
  );
}

interface DetalleLeadProps {
  empresaId: string;
  lead: LeadAdmin;
  puedeEliminar: boolean;
  puedeGestionar: boolean;
  usuario: User;
  onActualizar: (id: string, datos: DocumentData) => void;
  onCerrar: () => void;
  onEliminado: (id: string) => void;
}

function DetalleLead({
  empresaId,
  lead,
  puedeEliminar,
  puedeGestionar,
  usuario,
  onActualizar,
  onCerrar,
  onEliminado,
}: DetalleLeadProps) {
  const [diagnostico, setDiagnostico] = useState<DocumentData | null>(null);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [estadoNuevo, setEstadoNuevo] = useState(lead.estado as EstadoLead);
  const [tipoSeguimiento, setTipoSeguimiento] =
    useState<(typeof TIPOS_SEGUIMIENTO)[number]>("nota");
  const [notas, setNotas] = useState("");
  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    const database = db;
    if (!database) {
      setError("Firebase no está configurado.");
      setCargando(false);
      return;
    }

    let cancelado = false;
    setCargando(true);
    void Promise.all([
      getDocs(query(
        collection(database, "empresas", empresaId, "diagnosticos"),
        where("leadId", "==", lead.id),
        limit(1),
      )),
      getDocs(query(
        collection(
          database,
          "empresas",
          empresaId,
          "leads",
          lead.id,
          "seguimientos",
        ),
        orderBy("creadoEn", "desc"),
      )),
    ])
      .then(([diagnosticos, seguimientosSnapshot]) => {
        if (cancelado) {
          return;
        }
        setDiagnostico(diagnosticos.docs[0]?.data() ?? null);
        setSeguimientos(seguimientosSnapshot.docs.map((snapshot) => {
          const datos = snapshot.data();
          return {
            id: snapshot.id,
            tipo: texto(datos.tipo),
            notas: texto(datos.notas),
            creadoPor: texto(datos.creadoPor),
            creadoEn: datos.creadoEn,
          };
        }));
      })
      .catch((consultaError: unknown) => {
        if (!cancelado) {
          setError(
            consultaError instanceof Error
              ? consultaError.message
              : "No se pudieron cargar los datos del lead.",
          );
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [empresaId, lead.id]);

  async function cambiarEstado() {
    const database = db;
    if (!database || !puedeGestionar) {
      return;
    }
    setError("");
    const agregarFechaContacto =
      estadoNuevo === "contactado" && !("contactadoEn" in lead.datos);
    const cambios: DocumentData = {
      estado: estadoNuevo,
      ultimaActividadEn: serverTimestamp(),
    };
    if (agregarFechaContacto) {
      cambios.contactadoEn = serverTimestamp();
    }

    try {
      await updateDoc(
        doc(database, "empresas", empresaId, "leads", lead.id),
        cambios,
      );
      onActualizar(lead.id, {
        ...lead.datos,
        estado: estadoNuevo,
        ...(agregarFechaContacto ? { contactadoEn: new Date() } : {}),
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el estado.",
      );
    }
  }

  async function agregarSeguimiento(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const database = db;
    if (!database || !puedeGestionar || !usuario.email) {
      return;
    }
    setGuardandoSeguimiento(true);
    setError("");
    try {
      const referencia = doc(
        collection(
          database,
          "empresas",
          empresaId,
          "leads",
          lead.id,
          "seguimientos",
        ),
      );
      const seguimiento: Seguimiento = {
        id: referencia.id,
        tipo: tipoSeguimiento,
        notas: notas.trim(),
        creadoPor: usuario.email.toLowerCase(),
        creadoEn: new Date(),
      };
      const lote = writeBatch(database);
      lote.set(referencia, {
        tipo: tipoSeguimiento,
        notas: notas.trim(),
        creadoPor: usuario.email.toLowerCase(),
        creadoEn: serverTimestamp(),
      });
      await lote.commit();
      setSeguimientos((actuales) => [seguimiento, ...actuales]);
      setNotas("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el seguimiento.",
      );
    } finally {
      setGuardandoSeguimiento(false);
    }
  }

  async function eliminarLead() {
    const database = db;
    if (!database || !puedeEliminar) {
      return;
    }
    if (!window.confirm("¿Eliminar este lead, su diagnóstico y sus seguimientos?")) {
      return;
    }

    setEliminando(true);
    setError("");
    try {
      const seguimientosSnapshot = await getDocs(collection(
        database,
        "empresas",
        empresaId,
        "leads",
        lead.id,
        "seguimientos",
      ));
      for (let indice = 0; indice < seguimientosSnapshot.docs.length; indice += 499) {
        const loteSeguimientos = writeBatch(database);
        seguimientosSnapshot.docs
          .slice(indice, indice + 499)
          .forEach((seguimiento) => loteSeguimientos.delete(seguimiento.ref));
        await loteSeguimientos.commit();
      }

      const loteFinal = writeBatch(database);
      loteFinal.delete(doc(
        database,
        "empresas",
        empresaId,
        "diagnosticos",
        lead.id,
      ));
      loteFinal.delete(doc(
        database,
        "empresas",
        empresaId,
        "leads",
        lead.id,
      ));
      await loteFinal.commit();
      onEliminado(lead.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el lead y sus datos relacionados.",
      );
    } finally {
      setEliminando(false);
    }
  }

  const respuestas =
    diagnostico && typeof diagnostico.respuestas === "object" &&
      diagnostico.respuestas !== null
      ? Object.entries(diagnostico.respuestas as Record<string, unknown>)
      : [];
  const puntajeTotal =
    typeof diagnostico?.puntajeTotal === "number"
      ? diagnostico.puntajeTotal
      : "—";
  const puntajeMaximo =
    typeof diagnostico?.puntajeMaximo === "number"
      ? diagnostico.puntajeMaximo
      : "—";

  return (
    <section className="admin-detail">
      <div className="admin-detail-heading">
        <button className="secondary-button" onClick={onCerrar}>
          Volver a la lista
        </button>
        {puedeEliminar && (
          <button
            className="admin-danger-button"
            disabled={eliminando}
            onClick={() => void eliminarLead()}
          >
            {eliminando ? "Eliminando…" : "Eliminar"}
          </button>
        )}
      </div>
      <h2>{lead.nombre || "Lead sin nombre"}</h2>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {cargando ? (
        <p role="status">Cargando detalle…</p>
      ) : (
        <>
          <div className="admin-detail-grid">
            <section className="admin-card">
              <h3>Contacto</h3>
              <dl>
                <dt>Correo</dt><dd>{lead.correo || "—"}</dd>
                <dt>Teléfono</dt><dd>{texto(lead.datos.telefono) || "—"}</dd>
                <dt>Estado</dt><dd>{lead.estado}</dd>
                <dt>Creado</dt><dd>{fechaLegible(lead.datos.creadoEn)}</dd>
              </dl>
              <h3>Consentimiento</h3>
              <dl>
                <dt>Aceptado</dt>
                <dd>{lead.datos.consentimiento?.aceptado === true ? "Sí" : "No"}</dd>
                <dt>Versión</dt>
                <dd>{texto(lead.datos.consentimiento?.version) || "—"}</dd>
                <dt>Fecha</dt>
                <dd>{fechaLegible(lead.datos.consentimiento?.fecha)}</dd>
              </dl>
              {puedeGestionar && (
                <div className="admin-state-editor">
                  <label>
                    Cambiar estado
                    <select
                      onChange={(evento) =>
                        setEstadoNuevo(evento.target.value as EstadoLead)
                      }
                      value={estadoNuevo}
                    >
                      {ESTADOS.map((estado) => (
                        <option key={estado} value={estado}>{estado}</option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-button" onClick={() => void cambiarEstado()}>
                    Guardar estado
                  </button>
                </div>
              )}
            </section>

            <section className="admin-card">
              <h3>Diagnóstico</h3>
              {!diagnostico ? (
                <p>No hay diagnóstico asociado.</p>
              ) : (
                <>
                  <dl>
                    <dt>Puntaje</dt>
                    <dd>
                      {puntajeTotal} / {puntajeMaximo}
                    </dd>
                    <dt>Madurez del proceso</dt>
                    <dd>{typeof diagnostico.porcentaje === "number"
                      ? `${diagnostico.porcentaje}%`
                      : "—"}</dd>
                    <dt>Segmento</dt>
                    <dd>{texto(diagnostico.segmento) || "—"}</dd>
                    <dt>Completado</dt>
                    <dd>{fechaLegible(diagnostico.completadoEn)}</dd>
                  </dl>
                  <p className="admin-warning">
                    El puntaje no está verificado por el servidor.
                  </p>
                  <h4>Respuestas</h4>
                  <ul className="admin-answers">
                    {respuestas.map(([id, valor]) => {
                      const respuesta =
                        typeof valor === "object" && valor !== null
                          ? valor as Record<string, unknown>
                          : {};
                      return (
                        <li key={id}>
                          <strong>{texto(respuesta.pregunta) || id}</strong>
                          <span>{texto(respuesta.valorLegible)}</span>
                          <small>
                            {texto(respuesta.seccion)}
                            {texto(respuesta.seccion) ? " · " : ""}
                            {texto(respuesta.tipo)}
                          </small>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>

          <section className="admin-card admin-followups">
            <h3>Seguimientos</h3>
            {puedeGestionar && (
              <form className="admin-followup-form" onSubmit={(evento) => void agregarSeguimiento(evento)}>
                <label>
                  Tipo
                  <select
                    onChange={(evento) =>
                      setTipoSeguimiento(
                        evento.target.value as (typeof TIPOS_SEGUIMIENTO)[number],
                      )
                    }
                    value={tipoSeguimiento}
                  >
                    {TIPOS_SEGUIMIENTO.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Notas
                  <textarea
                    maxLength={2000}
                    onChange={(evento) => setNotas(evento.target.value)}
                    required
                    value={notas}
                  />
                </label>
                <button className="secondary-button" disabled={guardandoSeguimiento}>
                  {guardandoSeguimiento ? "Guardando…" : "Agregar seguimiento"}
                </button>
              </form>
            )}
            {seguimientos.length === 0 ? (
              <p>Aún no hay seguimientos.</p>
            ) : (
              <ul className="admin-followup-list">
                {seguimientos.map((seguimiento) => (
                  <li key={seguimiento.id}>
                    <div>
                      <strong>{seguimiento.tipo}</strong>
                      <span>{fechaLegible(seguimiento.creadoEn)}</span>
                    </div>
                    <p>{seguimiento.notas}</p>
                    <small>Por {seguimiento.creadoPor}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
