export type RolMiembroEmpresa = "propietario" | "admin" | "usuario";

const ROLES_MIEMBRO: RolMiembroEmpresa[] = [
  "propietario",
  "admin",
  "usuario",
];

export function normalizarRolMiembro(rol: unknown): RolMiembroEmpresa {
  if (rol === "propietario" || rol === "admin" || rol === "usuario") {
    return rol;
  }
  return "usuario";
}

export function esAdministradorEmpresa(rol: unknown): boolean {
  return rol === "admin" || rol === "propietario";
}

export function rolesAsignablesPor(
  rolActual: RolMiembroEmpresa | null,
  plataforma = false,
): RolMiembroEmpresa[] {
  if (plataforma) {
    return [...ROLES_MIEMBRO];
  }
  if (rolActual === "propietario") {
    return ["admin", "usuario"];
  }
  if (rolActual === "admin") {
    return ["usuario"];
  }
  return [];
}

export function puedeEditarMiembro(
  rolActual: RolMiembroEmpresa | null,
  rolDestino: RolMiembroEmpresa,
  esElMismoMiembro: boolean,
  plataforma = false,
): boolean {
  return puedeGestionarMiembro(
    rolActual,
    rolDestino,
    esElMismoMiembro,
    plataforma,
  );
}

export function puedeBorrarMiembro(
  rolActual: RolMiembroEmpresa | null,
  rolDestino: RolMiembroEmpresa,
  esElMismoMiembro: boolean,
  plataforma = false,
): boolean {
  return puedeGestionarMiembro(
    rolActual,
    rolDestino,
    esElMismoMiembro,
    plataforma,
  );
}

function puedeGestionarMiembro(
  rolActual: RolMiembroEmpresa | null,
  rolDestino: RolMiembroEmpresa,
  esElMismoMiembro: boolean,
  plataforma: boolean,
): boolean {
  if (plataforma) {
    return true;
  }
  if (!rolActual || esElMismoMiembro || rolDestino === "propietario") {
    return false;
  }
  return rolActual === "propietario" ||
    (rolActual === "admin" && rolDestino === "usuario");
}
