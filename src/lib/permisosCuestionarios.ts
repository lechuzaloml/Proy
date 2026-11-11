import type { RolMiembroEmpresa } from "../admin/rolesMiembros";

export type RolCuestionarios = RolMiembroEmpresa | "plataforma" | null;

export interface PermisosCuestionarios {
  editarCuestionarios?: unknown;
  publicarCuestionarios?: unknown;
}

function esAdministrador(rol: RolCuestionarios): boolean {
  return rol === "admin" || rol === "propietario" || rol === "plataforma";
}

export function puedePublicar(
  rol: RolCuestionarios,
  permisos: PermisosCuestionarios,
): boolean {
  return esAdministrador(rol) || permisos.publicarCuestionarios === true;
}

export function puedeEditarBorrador(
  rol: RolCuestionarios,
  permisos: PermisosCuestionarios,
  creadoPor: string,
  correoUsuario: string,
): boolean {
  if (esAdministrador(rol)) {
    return true;
  }
  const correoAutor = creadoPor.trim().toLowerCase();
  const correoActual = correoUsuario.trim().toLowerCase();
  return permisos.editarCuestionarios === true &&
    correoAutor.length > 0 &&
    correoAutor === correoActual;
}

export function puedeBorrarBorrador(
  rol: RolCuestionarios,
  permisos: PermisosCuestionarios,
  creadoPor: string,
  correoUsuario: string,
): boolean {
  return puedeEditarBorrador(rol, permisos, creadoPor, correoUsuario);
}
