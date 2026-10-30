import { esAdministradorEmpresa } from "../admin/rolesMiembros";

export interface UsuarioPlantillas {
  correo: string | null;
  correoVerificado: boolean;
}

export interface MembresiaPlantillas {
  empresaId: string;
  correo?: unknown;
  estado?: unknown;
  rol?: unknown;
  permisos?: unknown;
}

export function puedeCrearCopiasPlantilla(
  usuario: UsuarioPlantillas | null,
  esAdminPlataforma: boolean,
  empresaId: string,
  membresias: MembresiaPlantillas[],
): boolean {
  const correo = usuario?.correo?.toLowerCase();
  if (!usuario || !usuario.correoVerificado || !correo) {
    return false;
  }
  if (esAdminPlataforma) {
    return true;
  }

  return membresias.some((membresia) => {
    if (
      typeof membresia.permisos !== "object" ||
      membresia.permisos === null
    ) {
      return false;
    }
    const permisos = membresia.permisos as Record<string, unknown>;
    return membresia.empresaId === empresaId &&
      membresia.correo === correo &&
      membresia.estado === "activo" &&
      (esAdministradorEmpresa(membresia.rol) ||
        permisos.editarCuestionarios === true);
  });
}
