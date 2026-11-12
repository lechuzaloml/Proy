import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { esEmpresaProtegida, puedeEliminar } from "../config/empresas";
import { CLAVE_EMPRESA_ACTIVA } from "../config/empresaActiva";
import { auth } from "../lib/firebaseAuth";
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
  propietariosActivos: boolean;
  miembros: number;
  leads: number;
  cuestionarios: number;
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
    planId: PLANES.includes(data.planId)
      ? data.planId
      : "inicial",
    estado: data.estado === "suspendida" ? "suspendida" : "activa",
    propietariosActivos: false,
    miembros: 0,
    leads: 0,
    cuestionarios: 0,
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
  const [correoPropietario, setCorreoPropietario] = useState("");
  const [empresaPorEliminarId, setEmpresaPorEliminarId] = useState("");
  const [idConfirmado, setIdConfirmado] = useState("");
  const [liberarPrueba, setLiberarPrueba] = useState(false);
  const [eliminando, setEliminando] = useState(false);

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
      const siguientes = await Promise.all(resultado.docs.map(async (snapshot) => {
        const [miembros, leads, cuestionarios] = await Promise.all([
          getDocs(collection(database, "empresas", snapshot.id, "miembros")),
          getDocs(collection(database, "empresas", snapshot.id, "leads")),
          getDocs(collection(database, "empresas", snapshot.id, "cuestionarios")),
        ]);
        const propietarioActivo = miembros.docs.some((miembro) =>
          miembro.data().estado === "activo" &&
          miembro.data().rol === "propietario",
        );
        return {
          ...empresaDesdeDocumento(snapshot.id, snapshot.data()),
          propietariosActivos: propietarioActivo,
          miembros: miembros.size,
          leads: leads.size,
          cuestionarios: cuestionarios.size,
        };
      })).then((empresasCargadas) =>
        empresasCargadas.sort((primero, segundo) =>
          primero.nombre.localeCompare(segundo.nombre),
        ),
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
          publicarCuestionarios: true,
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

  async function asignarPropietario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const database = db;
    const empresa = empresaSeleccionada;
    const correo = normalizarCorreoEmpresa(correoPropietario);
    if (!database || !empresa || !correo) {
      setError("Escribe un correo válido para asignar al propietario.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const miembroRef = doc(database, "empresas", empresa.id, "miembros", correo);
      const miembroExistente = await getDoc(miembroRef);
      await setDoc(miembroRef, {
        correo,
        rol: "propietario",
        permisos: {
          verLeads: true,
          gestionarLeads: true,
          editarCuestionarios: true,
          publicarCuestionarios: true,
        },
        estado: "activo",
        ...(miembroExistente.exists() ? {} : { creadoEn: serverTimestamp() }),
      }, { merge: true });
      setCorreoPropietario("");
      await recargarEmpresas();
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "No se pudo asignar el propietario.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarEmpresa() {
    const empresaId = empresaPorEliminarId;
    if (!empresaId || idConfirmado !== empresaId) {
      return;
    }
    const usuario = auth?.currentUser;
    if (!usuario) {
      setError("Inicia sesión como administrador de plataforma para eliminar empresas.");
      return;
    }

    setEliminando(true);
    setError("");
    try {
      const token = await usuario.getIdToken();
      const respuesta = await fetch("/api/empresas/eliminar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ empresaId, liberarPrueba }),
      });
      const resultado: unknown = await respuesta.json();
      if (!respuesta.ok) {
        const mensaje = typeof resultado === "object" && resultado !== null &&
            "error" in resultado && typeof resultado.error === "string"
          ? resultado.error
          : "No se pudo eliminar la empresa.";
        throw new Error(mensaje);
      }

      if (window.localStorage.getItem(CLAVE_EMPRESA_ACTIVA) === empresaId) {
        window.localStorage.removeItem(CLAVE_EMPRESA_ACTIVA);
      }
      setEmpresaPorEliminarId("");
      setIdConfirmado("");
      setLiberarPrueba(false);
      await recargarEmpresas();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar la empresa.",
      );
    } finally {
      setEliminando(false);
    }
  }

  const empresaPorEliminar =
    empresas.find(({ id }) => id === empresaPorEliminarId) ?? null;

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
                  <th>Propiedad</th>
                  <th>Acciones</th>
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
                    <td>
                      <span className={`company-status company-status-${empresa.estado}`}>
                        {empresa.estado === "activa" ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td>
                      {empresa.propietariosActivos
                        ? "Propietario activo"
                        : <span className="company-owner-missing">Sin propietario</span>}
                    </td>
                    <td>
                      {(() => {
                        const protegida = esEmpresaProtegida(empresa.id);
                        const elegible = puedeEliminar(
                          empresa.estado,
                          empresa.propietariosActivos,
                        );
                        const motivo = protegida
                          ? "Empresa protegida."
                          : elegible
                          ? ""
                          : "Debe suspender la empresa antes de eliminarla.";
                        return (
                          <>
                            <button
                              className="secondary-button"
                              disabled={guardando || eliminando || protegida || !elegible}
                              onClick={() => {
                                setEmpresaPorEliminarId(empresa.id);
                                setIdConfirmado("");
                                setLiberarPrueba(false);
                              }}
                              type="button"
                            >
                              Eliminar empresa
                            </button>
                            {motivo && <small className="company-delete-reason">{motivo}</small>}
                          </>
                        );
                      })()}
                    </td>
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
          {!empresaSeleccionada.propietariosActivos && (
            <section className="admin-card">
              <h2>Asignar propietario</h2>
              <p>
                La empresa no tiene un propietario activo. Asigna un correo
                para crear o actualizar su membresía con permisos completos.
              </p>
              <form className="admin-company-form" onSubmit={(evento) => void asignarPropietario(evento)}>
                <label>
                  Correo del propietario
                  <input
                    onChange={(evento) => setCorreoPropietario(evento.target.value)}
                    required
                    type="email"
                    value={correoPropietario}
                  />
                </label>
                <button className="secondary-button" disabled={guardando}>
                  {guardando ? "Asignando…" : "Asignar propietario"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {empresaPorEliminar && (
        <div className="company-delete-backdrop">
          <section
            aria-labelledby="company-delete-title"
            aria-modal="true"
            className="company-delete-dialog admin-card"
            role="alertdialog"
          >
            <h2 id="company-delete-title">
              Eliminar {empresaPorEliminar.nombre}
            </h2>
            <p>
              Se perderán {empresaPorEliminar.leads} leads,{" "}
              {empresaPorEliminar.cuestionarios} cuestionarios y{" "}
              {empresaPorEliminar.miembros} miembros, además de todos sus
              diagnósticos, seguimientos, versiones y datos de suscripción.
            </p>
            <p>
              Esta acción es irreversible. No se eliminarán las cuentas de
              Google de sus miembros.
            </p>
            <label>
              Escribe el ID exacto <strong>{empresaPorEliminar.id}</strong>
              <input
                autoComplete="off"
                onChange={(evento) => setIdConfirmado(evento.target.value)}
                value={idConfirmado}
              />
            </label>
            <label className="company-delete-release">
              <input
                checked={liberarPrueba}
                onChange={(evento) => setLiberarPrueba(evento.target.checked)}
                type="checkbox"
              />
              Permitir otra prueba gratuita a este correo (solo para pruebas)
            </label>
            <div className="company-delete-actions">
              <button
                className="secondary-button"
                disabled={eliminando}
                onClick={() => {
                  setEmpresaPorEliminarId("");
                  setIdConfirmado("");
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="submit-button"
                disabled={eliminando || idConfirmado !== empresaPorEliminar.id}
                onClick={() => void eliminarEmpresa()}
                type="button"
              >
                {eliminando ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
