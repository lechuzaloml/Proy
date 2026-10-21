export interface UsuarioPlantillas {
  correo: string | null;
  correoVerificado: boolean;
}

export interface MembresiaPlantillas {
  correo?: unknown;
  estado?: unknown;
  rol?: unknown;
  permisos?: unknown;
}

export function puedeCrearCopiasPlantilla(
  usuario: UsuarioPlantillas | null,
  esAdminPlataforma: boolean,
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
    return membresia.correo === correo &&
      membresia.estado === "activo" &&
      (membresia.rol === "admin" || permisos.editarCuestionarios === true);
  });
}
