export const EMPRESAS_PROTEGIDAS = [
  "admin",
  "e",
  "api",
  "assets",
  "static",
  "login",
  "clearia",
] as const;

const REGEX_SLUG_EMPRESA = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const SLUGS_PROTEGIDOS = new Set<string>(EMPRESAS_PROTEGIDAS);

export function validarSlugEmpresaId(valor: unknown): valor is string {
  return typeof valor === "string" &&
    REGEX_SLUG_EMPRESA.test(valor) &&
    !SLUGS_PROTEGIDOS.has(valor);
}

export function esEmpresaProtegida(empresaId: string): boolean {
  return SLUGS_PROTEGIDOS.has(empresaId);
}

export function puedeEliminar(
  estado: unknown,
  propietarioActivo: boolean,
): boolean {
  return estado === "suspendida" || !propietarioActivo;
}
