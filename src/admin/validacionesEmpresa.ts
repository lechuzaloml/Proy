const SLUGS_RESERVADOS = new Set([
  "admin",
  "e",
  "api",
  "assets",
  "static",
  "login",
]);

const REGEX_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface MarcaEmpresa {
  colorPrimario: string;
  logoUrl?: string;
}

export function validarSlugEmpresa(valor: string): boolean {
  return REGEX_SLUG.test(valor) && !SLUGS_RESERVADOS.has(valor);
}

export function normalizarCorreoEmpresa(valor: string): string | null {
  const normalizado = valor.trim().toLowerCase();
  return REGEX_CORREO.test(normalizado) ? normalizado : null;
}

export function validarMarcaEmpresa(marca: MarcaEmpresa): boolean {
  if (!REGEX_COLOR.test(marca.colorPrimario)) {
    return false;
  }

  if (marca.logoUrl === undefined || marca.logoUrl === "") {
    return true;
  }

  return marca.logoUrl.length <= 300 && URL.canParse(marca.logoUrl)
    && new URL(marca.logoUrl).protocol === "https:";
}

export function normalizarUrlLogo(valor: string): string | null {
  const limpio = valor.trim();
  if (!limpio) {
    return "";
  }
  if (limpio.length > 300 || !URL.canParse(limpio)) {
    return null;
  }
  const url = new URL(limpio);
  return url.protocol === "https:" ? url.toString() : null;
}
