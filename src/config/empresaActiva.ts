export const CLAVE_EMPRESA_ACTIVA = "clearIaEmpresaActiva";

export function obtenerEmpresaActivaInicial(): string {
  const empresaEnUrl = new URLSearchParams(window.location.search).get("empresa");
  return empresaEnUrl?.trim() ||
    window.localStorage.getItem(CLAVE_EMPRESA_ACTIVA)?.trim() ||
    "";
}
