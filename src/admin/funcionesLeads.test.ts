import { describe, expect, it } from "vitest";
import {
  filtrarOrdenarLeads,
  type LeadParaLista,
} from "./funcionesLeads";

const leads: LeadParaLista[] = [
  {
    id: "1",
    nombre: "Ana López",
    correo: "ana@example.com",
    estado: "nuevo",
    ultimoSegmento: "inicial",
    ultimoPorcentaje: 35,
    creadoEn: new Date("2026-01-01"),
  },
  {
    id: "2",
    nombre: "Luis Pérez",
    correo: "luis@example.com",
    estado: "contactado",
    ultimoSegmento: "avanzado",
    ultimoPorcentaje: 80,
    creadoEn: new Date("2026-02-01"),
  },
  {
    id: "3",
    nombre: "Ana Torres",
    correo: "ana.torres@example.com",
    estado: "nuevo",
    ultimoSegmento: "inicial",
    ultimoPorcentaje: 55,
    creadoEn: new Date("2026-03-01"),
  },
];

describe("filtrarOrdenarLeads", () => {
  it("busca por nombre o correo sin distinguir mayúsculas", () => {
    expect(
      filtrarOrdenarLeads(leads, {
        busqueda: "ANA@EXAMPLE",
        segmento: "",
        estado: "",
        orden: "fecha",
      }).map(({ id }) => id),
    ).toEqual(["1"]);
  });

  it("aplica filtros de segmento y estado y ordena por madurez", () => {
    expect(
      filtrarOrdenarLeads(leads, {
        busqueda: "ana",
        segmento: "inicial",
        estado: "nuevo",
        orden: "madurez",
      }).map(({ id }) => id),
    ).toEqual(["3", "1"]);
  });

  it("ordena por fecha descendente", () => {
    expect(
      filtrarOrdenarLeads(leads, {
        busqueda: "",
        segmento: "",
        estado: "",
        orden: "fecha",
      }).map(({ id }) => id),
    ).toEqual(["3", "2", "1"]);
  });
});
