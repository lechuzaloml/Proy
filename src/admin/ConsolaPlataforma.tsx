import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import GestorMiembros from "./GestorMiembros";
import {
  normalizarCorreoEmpresa,
  normalizarUrlLogo,
  validarMarcaEmpresa,
  validarSlugEmpresa,
  type MarcaEmpresa,
} from "./validacionesEmpresa";

const PLANES = ["interno", "inicial", "pro", "avanzado"] as const;
type PlanEmpresa = (typeof PLANES)[number];
type EstadoEmpresa = "activa" | "suspendida";

interface Empresa {
  id: string;
  nombre: string;
  planId: PlanEmpresa;
  estado: EstadoEmpresa;
  marca: MarcaEmpresa;
}

function empresaDesdeDocumento(
  id: string,
  data: DocumentData,
): Empresa {
  const marcaData =
    typeof data.marca === "object" && data.marca !== null
      ? data.marca as Record<string, unknown>
      : {};
  return {
    id,
    nombre: typeof data.nombre === "string" ? data.nombre : "",
    planId: PLANES.includes(data.planId) ? data.planId : "interno",
    estado: data.estado === "suspendida" ? "suspendida" : "activa",
    marca: {
      colorPrimario: typeof marcaData.colorPrimario === "string"
        ? marcaData.colorPrimario
        : "#E2554F",
      ...(typeof marcaData.logoUrl === "string"
        ? { logoUrl: marcaData.logoUrl }
        : {}),
    },
  };
}

interface ConsolaPlataformaProps {
  onVolver: () => void;
}

export default function ConsolaPlataforma({
  onVolver,
}: ConsolaPlataformaProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSeleccionadaId, setEmpresaSeleccionadaId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [nombreNueva, setNombreNueva] = useState("");
  const [planNuevo, setPlanNuevo] = useState<PlanEmpresa>("inicial");
  const [correoAdmin, setCorreoAdmin] = useState("");
  const [nombreEditado, setNombreEditado] = useState("");
  const [planEditado, setPlanEditado] = useState<PlanEmpresa>("interno");
  const [estadoEditado, setEstadoEditado] = useState<EstadoEmpresa>("activa");
  const [colorPrimario, setColorPrimario] = useState("#E2554F");
  const [logoUrl, setLogoUrl] = useState("");

  const empresaSeleccionada =
    empresas.find(({ id }) => id === empresaSeleccionadaId) ?? null;

  async function recargarEmpresas() {
    const database = db;
    if (!database) {
      setError("Firebase no está configurado.");
      setCargando(false);
      return;
    }
    setCargando(true);
    setError("");
    try {
      const resultado = await getDocs(collection(database, "empresas"));
      const siguientes = resultado.docs
        .map((snapshot) => empresaDesdeDocumento(snapshot.id, snapshot.data()))
        .sort((primero, segundo) =>
          primero.nombre.localeCompare(segundo.nombre),
        );
      setEmpresas(siguientes);
      setEmpresaSeleccionadaId((actual) =>
        siguientes.some(({ id }) => id === actual)
          ? actual
          : siguientes[0]?.id ?? "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las empresas.",
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void recargarEmpresas();
  }, []);

  useEffect(() => {
    if (!empresaSeleccionada) {
      setNombreEditado("");
      setLogoUrl("");
      return;
    }
    setNombreEditado(empresaSeleccionada.nombre);
    setPlanEditado(empresaSeleccionada.planId);
    setEstadoEditado(empresaSeleccionada.estado);
    setColorPrimario(empresaSeleccionada.marca.colorPrimario);
    setLogoUrl(empresaSeleccionada.marca.logoUrl ?? "");
  }, [empresaSeleccionadaId, empresas]);

  async function crearEmpresa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const database = db;
    const correoNormalizado = normalizarCorreoEmpresa(correoAdmin);
    if (!database) {
      setError("Firebase no está configurado.");
      return;
    }
    if (!validarSlugEmpresa(slug)) {
      setError("El ID debe ser un slug válido y no reservado.");
      return;
    }
    if (!correoNormalizado) {
      setError("Escribe un correo válido para el administrador inicial.");
      return;
    }
    if (!nombreNueva.trim()) {
      setError("El nombre de la empresa es obligatorio.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const empresaRef = doc(database, "empresas", slug);
      const existente = await getDoc(empresaRef);
      if (existente.exists()) {
        setError("Ya existe una empresa con ese ID.");
        return;
      }
      const lote = writeBatch(database);
      lote.set(empresaRef, {
        nombre: nombreNueva.trim(),
        estado: "activa",
        planId: planNuevo,
        marca: { colorPrimario: "#E2554F" },
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      lote.set(doc(
        database,
        "empresas",
        slug,
        "miembros",
        correoNormalizado,
      ), {
        correo: correoNormalizado,
        rol: "propietario",
        permisos: {
          verLeads: true,
          gestionarLeads: true,
          editarCuestionarios: true,
        },
        estado: "activo",
        creadoEn: serverTimestamp(),
      });
      await lote.commit();
      setSlug("");
      setNombreNueva("");
      setPlanNuevo("inicial");
      setCorreoAdmin("");
      await recargarEmpresas();
      setEmpresaSeleccionadaId(slug);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la empresa.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEmpresa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const database = db;
    if (!database || !empresaSeleccionada) {
      return;
    }
    const logoSeguro = normalizarUrlLogo(logoUrl);
    const marca: MarcaEmpresa = {
      colorPrimario,
      ...(logoSeguro ? { logoUrl: logoSeguro } : {}),
    };
    if (!nombreEditado.trim()) {
      setError("El nombre de la empresa es obligatorio.");
      return;
    }
    if (logoSeguro === null || !validarMarcaEmpresa(marca)) {
      setError("La marca requiere un color #RRGGBB y un logo HTTPS de hasta 300 caracteres.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      await updateDoc(doc(database, "empresas", empresaSeleccionada.id), {
        nombre: nombreEditado.trim(),
        planId: planEditado,
        estado: estadoEditado,
        marca,
        actualizadoEn: serverTimestamp(),
      });
      setEmpresas((actuales) => actuales.map((empresa) =>
        empresa.id === empresaSeleccionada.id
          ? { ...empresa, nombre: nombreEditado.trim(), planId: planEditado, estado: estadoEditado, marca }
          : empresa,
      ));
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar la empresa.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Clear-IA</p>
          <h1>Consola de plataforma</h1>
        </div>
        <button className="secondary-button" onClick={onVolver}>
          Volver al panel
        </button>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}

      <section className="admin-card">
        <h2>Empresas</h2>
        {cargando ? (
          <p role="status">Cargando empresas…</p>
        ) : empresas.length === 0 ? (
          <p>No hay empresas.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>ID</th>
                  <th>Plan</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((empresa) => (
                  <tr key={empresa.id}>
                    <td>
                      <button
                        className="admin-lead-link"
                        onClick={() => setEmpresaSeleccionadaId(empresa.id)}
                      >
                        {empresa.nombre}
                      </button>
                    </td>
                    <td>{empresa.id}</td>
                    <td>{empresa.planId}</td>
                    <td>{empresa.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>Crear empresa</h2>
        <form className="admin-company-form" onSubmit={(evento) => void crearEmpresa(evento)}>
          <label>
            ID (slug)
            <input
              maxLength={40}
              onChange={(evento) => setSlug(evento.target.value)}
              pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
              required
              value={slug}
            />
          </label>
          <label>
            Nombre
            <input
              maxLength={120}
              onChange={(evento) => setNombreNueva(evento.target.value)}
              required
              value={nombreNueva}
            />
          </label>
          <label>
            Plan
            <select
              onChange={(evento) => setPlanNuevo(evento.target.value as PlanEmpresa)}
              value={planNuevo}
            >
              {PLANES.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
            </select>
          </label>
          <label>
            Correo del primer administrador
            <input
              onChange={(evento) => setCorreoAdmin(evento.target.value)}
              required
              type="email"
              value={correoAdmin}
            />
          </label>
          <button className="secondary-button" disabled={guardando}>
            {guardando ? "Creando…" : "Crear empresa"}
          </button>
        </form>
      </section>

      {empresaSeleccionada && (
        <>
          <section className="admin-card">
            <h2>Editar {empresaSeleccionada.nombre}</h2>
            <p>ID: <code>{empresaSeleccionada.id}</code></p>
            {normalizarUrlLogo(empresaSeleccionada.marca.logoUrl ?? "") && (
              <img
                alt={`Logo de ${empresaSeleccionada.nombre}`}
                className="admin-company-logo"
                src={normalizarUrlLogo(empresaSeleccionada.marca.logoUrl ?? "") ?? ""}
              />
            )}
            <form className="admin-company-form" onSubmit={(evento) => void guardarEmpresa(evento)}>
              <label>
                Nombre
                <input
                  maxLength={120}
                  onChange={(evento) => setNombreEditado(evento.target.value)}
                  required
                  value={nombreEditado}
                />
              </label>
              <label>
                Plan
                <select
                  onChange={(evento) => setPlanEditado(evento.target.value as PlanEmpresa)}
                  value={planEditado}
                >
                  {PLANES.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(evento) => setEstadoEditado(evento.target.value as EstadoEmpresa)}
                  value={estadoEditado}
                >
                  <option value="activa">Activa</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </label>
              <label>
                Color primario
                <input
                  onChange={(evento) => setColorPrimario(evento.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  required
                  value={colorPrimario}
                />
              </label>
              <label>
                URL del logo (HTTPS)
                <input
                  maxLength={300}
                  onChange={(evento) => setLogoUrl(evento.target.value)}
                  type="url"
                  value={logoUrl}
                />
              </label>
              <button className="secondary-button" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar empresa"}
              </button>
            </form>
          </section>
          <GestorMiembros
            empresaId={empresaSeleccionada.id}
            empresaNombre={empresaSeleccionada.nombre}
            plataforma
          />
        </>
      )}
    </main>
  );
}
