export const PLANES_SUSCRIPCION = [
  { id: "inicial", nombre: "Inicial", limite: 3 },
  { id: "pro", nombre: "Pro", limite: 10 },
  { id: "avanzado", nombre: "Avanzado", limite: 25 },
] as const;

export type PlanSuscripcionId = (typeof PLANES_SUSCRIPCION)[number]["id"];

export function limiteDePlan(planId: string): number {
  if (planId === "interno") {
    return Number.POSITIVE_INFINITY;
  }
  return PLANES_SUSCRIPCION.find((plan) => plan.id === planId)?.limite ??
    PLANES_SUSCRIPCION[0].limite;
}

export function puedePublicarMas(usados: number, limite: number): boolean {
  return usados < limite;
}
