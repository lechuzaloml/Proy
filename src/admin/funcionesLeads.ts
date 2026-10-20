export type OrdenLeads = "fecha" | "madurez";

export interface LeadParaLista {
  id: string;
  nombre: string;
  correo: string;
  estado: string;
  ultimoSegmento?: string;
  ultimoPorcentaje?: number;
  creadoEn?: unknown;
}

export interface FiltrosLeads {
  busqueda: string;
  segmento: string;
  estado: string;
  orden: OrdenLeads;
}

function tiempo(fecha: unknown): number {
  if (fecha instanceof Date) {
    return fecha.getTime();
  }
  if (
    typeof fecha === "object" &&
    fecha !== null &&
    "toMillis" in fecha &&
    typeof fecha.toMillis === "function"
  ) {
    return fecha.toMillis();
  }
  return 0;
}

export function filtrarOrdenarLeads(
  leads: LeadParaLista[],
  filtros: FiltrosLeads,
): LeadParaLista[] {
  const busqueda = filtros.busqueda.trim().toLocaleLowerCase();

  return leads
    .filter((lead) => {
      const coincideBusqueda =
        !busqueda ||
        lead.nombre.toLocaleLowerCase().includes(busqueda) ||
        lead.correo.toLocaleLowerCase().includes(busqueda);
      const coincideSegmento =
        !filtros.segmento || lead.ultimoSegmento === filtros.segmento;
      const coincideEstado = !filtros.estado || lead.estado === filtros.estado;
      return coincideBusqueda && coincideSegmento && coincideEstado;
    })
    .sort((primero, segundo) => {
      if (filtros.orden === "madurez") {
        return (segundo.ultimoPorcentaje ?? -1) -
          (primero.ultimoPorcentaje ?? -1);
      }
      return tiempo(segundo.creadoEn) - tiempo(primero.creadoEn);
    });
}
