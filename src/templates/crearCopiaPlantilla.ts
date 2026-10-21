export interface CopiaPlantilla<TConfiguracion = unknown> {
  id: string;
  nombre: string;
  configuracion: TConfiguracion;
}

export function crearCopiaPlantilla<TConfiguracion>(
  nombre: string,
  configuracion: TConfiguracion,
): CopiaPlantilla<TConfiguracion> {
  return {
    id: `personalizado-${crypto.randomUUID()}`,
    nombre: `Copia de ${nombre}`,
    configuracion: structuredClone(configuracion),
  };
}
