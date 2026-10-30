import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizarCorreoEmpresa } from "./validacionesEmpresa";
import {
  normalizarRolMiembro,
  puedeBorrarMiembro,
  puedeEditarMiembro,
  rolesAsignablesPor,
  type RolMiembroEmpresa,
} from "./rolesMiembros";

const PERMISOS = [
  ["verLeads", "Ver leads"],
  ["gestionarLeads", "Gestionar leads"],
  ["editarCuestionarios", "Editar cuestionarios"],
] as const;

interface MiembroEmpresa {
  correo: string;
  rol: RolMiembroEmpresa;
  estado: "activo" | "inactivo";
  permisos: Record<(typeof PERMISOS)[number][0], boolean>;
  creadoEn?: unknown;
}

function parsearMiembro(data: DocumentData): MiembroEmpresa {
  const permisos =
    typeof data.permisos === "object" && data.permisos !== null
      ? data.permisos as Record<string, unknown>
      : {};
  return {
    correo: typeof data.correo === "string" ? data.correo : "",
    rol: normalizarRolMiembro(data.rol),
    estado: data.estado === "activo" ? "activo" : "inactivo",
    permisos: {
      verLeads: permisos.verLeads === true,
      gestionarLeads: permisos.gestionarLeads === true,
      editarCuestionarios: permisos.editarCuestionarios === true,
    },
    creadoEn: data.creadoEn,
  };
}

const PERMISOS_VACIOS: MiembroEmpresa["permisos"] = {
  verLeads: false,
  gestionarLeads: false,
  editarCuestionarios: false,
};

interface GestorMiembrosProps {
  empresaId: string;
  empresaNombre: string;
  rolActual?: RolMiembroEmpresa;
  correoActual?: string;
  plataforma?: boolean;
}

export default function GestorMiembros({
  empresaId,
  empresaNombre,
  rolActual,
  correoActual,
  plataforma = false,
}: GestorMiembrosProps) {
  const [miembros, setMiembros] = useState<MiembroEmpresa[]>([]);
  const [correo, setCorreo] = useState("");
  const [correoEdicion, setCorreoEdicion] = useState("");
  const [rol, setRol] = useState<MiembroEmpresa["rol"]>("usuario");
  const [estado, setEstado] = useState<MiembroEmpresa["estado"]>("activo");
  const [permisos, setPermisos] =
    useState<MiembroEmpresa["permisos"]>(PERMISOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const rolesAsignables = rolesAsignablesPor(rolActual ?? null, plataforma);

  useEffect(() => {
    const database = db;
    if (!database || !empresaId) {
      setMiembros([]);
      setCargando(false);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError("");
    void getDocs(collection(database, "empresas", empresaId, "miembros"))
      .then((resultado) => {
        if (!cancelado) {
          setMiembros(resultado.docs.map((snapshot) =>
            parsearMiembro(snapshot.data()),
          ));
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelado) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar los miembros.",
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
  }, [empresaId]);

  async function guardarMiembro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const database = db;
    const correoNormalizado = normalizarCorreoEmpresa(correo);
    if (!database || !correoNormalizado) {
      setError("Escribe un correo electrónico válido.");
      return;
    }

    const miembroActual = miembros.find(
      (miembro) => miembro.correo === correoNormalizado,
    );
    if (!rolesAsignables.includes(rol)) {
      setError("No puedes asignar ese rol.");
      return;
    }
    if (
      miembroActual &&
      !puedeEditarMiembro(
        rolActual ?? null,
        miembroActual.rol,
        miembroActual.correo === correoActual?.trim().toLowerCase(),
        plataforma,
      )
    ) {
      setError("No puedes editar este miembro.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const miembroRef = doc(
        database,
        "empresas",
        empresaId,
        "miembros",
        correoNormalizado,
      );
      await setDoc(miembroRef, {
        correo: correoNormalizado,
        rol,
        estado,
        permisos,
        creadoEn: miembroActual?.creadoEn ?? serverTimestamp(),
      });
      setMiembros((actuales) => {
        const otros = actuales.filter(
          (miembro) => miembro.correo !== correoNormalizado,
        );
        return [...otros, {
          correo: correoNormalizado,
          rol,
          estado,
          permisos: { ...permisos },
          creadoEn: miembroActual?.creadoEn,
        }].sort((primero, segundo) =>
          primero.correo.localeCompare(segundo.correo),
        );
      });
      setCorreo("");
      setCorreoEdicion("");
      setRol("usuario");
      setEstado("activo");
      setPermisos(PERMISOS_VACIOS);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el miembro.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function bajaMiembro(correoMiembro: string) {
    const database = db;
    const miembro = miembros.find(
      (candidato) => candidato.correo === correoMiembro,
    );
    if (
      !database ||
      !miembro ||
      !puedeBorrarMiembro(
        rolActual ?? null,
        miembro.rol,
        miembro.correo === correoActual?.trim().toLowerCase(),
        plataforma,
      )
    ) {
      if (database && miembro) {
        setError("No puedes dar de baja a este miembro.");
      }
      return;
    }
    setError("");
    try {
      await deleteDoc(doc(
        database,
        "empresas",
        empresaId,
        "miembros",
        correoMiembro,
      ));
      setMiembros((actuales) =>
        actuales.filter((miembro) => miembro.correo !== correoMiembro),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo dar de baja al miembro.",
      );
    }
  }

  return (
    <section className="admin-card admin-members">
      <div>
        <h2>Miembros de {empresaNombre}</h2>
        <p>Administra roles, permisos y acceso a esta empresa.</p>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <form className="admin-member-form" onSubmit={(evento) => void guardarMiembro(evento)}>
        <label>
          Correo
          <input
            autoComplete="off"
            disabled={Boolean(correoEdicion)}
            onChange={(evento) => setCorreo(evento.target.value)}
            required
            type="email"
            value={correo}
          />
        </label>
        <label>
          Rol
          <select
            onChange={(evento) => setRol(evento.target.value as MiembroEmpresa["rol"])}
            value={rol}
          >
            {rolesAsignables.map((rolDisponible) => (
              <option key={rolDisponible} value={rolDisponible}>
                {rolDisponible === "propietario"
                  ? "Propietario"
                  : rolDisponible === "admin"
                    ? "Administrador"
                    : "Usuario"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            onChange={(evento) =>
              setEstado(evento.target.value as MiembroEmpresa["estado"])
            }
            value={estado}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>
        <fieldset>
          <legend>Permisos</legend>
          {PERMISOS.map(([clave, etiqueta]) => (
            <label key={clave}>
              <input
                checked={permisos[clave]}
                onChange={(evento) =>
                  setPermisos((actuales) => ({
                    ...actuales,
                    [clave]: evento.target.checked,
                  }))
                }
                type="checkbox"
              />
              {etiqueta}
            </label>
          ))}
        </fieldset>
        <button className="secondary-button" disabled={guardando}>
          {guardando
            ? "Guardando…"
            : correoEdicion
              ? "Guardar cambios"
              : "Guardar miembro"}
        </button>
        {correoEdicion && (
          <button
            className="secondary-button"
            onClick={() => {
              setCorreo("");
              setCorreoEdicion("");
              setRol("usuario");
              setEstado("activo");
              setPermisos(PERMISOS_VACIOS);
            }}
            type="button"
          >
            Cancelar edición
          </button>
        )}
      </form>
      {cargando ? (
        <p role="status">Cargando miembros…</p>
      ) : miembros.length === 0 ? (
        <p>No hay miembros registrados.</p>
      ) : (
        <ul className="admin-member-list">
          {miembros.map((miembro) => (
            <li key={miembro.correo}>
              <div>
                <strong>{miembro.correo}</strong>
                <span>
                  {miembro.rol} · {miembro.estado}
                </span>
                <small>
                  {PERMISOS
                    .filter(([clave]) => miembro.permisos[clave])
                    .map(([, etiqueta]) => etiqueta)
                    .join(", ") || "Sin permisos explícitos"}
                </small>
              </div>
              {puedeEditarMiembro(
                rolActual ?? null,
                miembro.rol,
                miembro.correo === correoActual?.trim().toLowerCase(),
                plataforma,
              ) && puedeBorrarMiembro(
                rolActual ?? null,
                miembro.rol,
                miembro.correo === correoActual?.trim().toLowerCase(),
                plataforma,
              ) ? (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setCorreo(miembro.correo);
                      setCorreoEdicion(miembro.correo);
                      setRol(miembro.rol);
                      setEstado(miembro.estado);
                      setPermisos({ ...miembro.permisos });
                    }}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="admin-danger-button"
                    onClick={() => {
                      if (window.confirm(`¿Dar de baja a ${miembro.correo}?`)) {
                        void bajaMiembro(miembro.correo);
                      }
                    }}
                    type="button"
                  >
                    Dar de baja
                  </button>
                </>
              ) : (
                <span className="admin-note">{miembro.rol}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {plataforma && <p className="admin-note">Administración de plataforma</p>}
    </section>
  );
}
