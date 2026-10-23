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
    cuestionarioId: "personalizado-a",
    cuestionarioNombre: "Cuestionario A",
    ultimoSegmento: "inicial",
    ultimoPorcentaje: 35,
    creadoEn: new Date("2026-01-01"),
  },
  {
    id: "2",
    nombre: "Luis Pérez",
    correo: "luis@example.com",
    estado: "contactado",
    cuestionarioId: "personalizado-b",
    cuestionarioNombre: "Cuestionario B",
    ultimoSegmento: "avanzado",
    ultimoPorcentaje: 80,
    creadoEn: new Date("2026-02-01"),
  },
  {
    id: "3",
    nombre: "Ana Torres",
    correo: "ana.torres@example.com",
    estado: "nuevo",
    cuestionarioId: "personalizado-a",
    cuestionarioNombre: "Cuestionario A",
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
        cuestionario: "",
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
        cuestionario: "",
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
        cuestionario: "",
        orden: "fecha",
      }).map(({ id }) => id),
    ).toEqual(["3", "2", "1"]);
  });

  it("filtra por cuestionario de origen", () => {
    expect(
      filtrarOrdenarLeads(leads, {
        busqueda: "",
        segmento: "",
        estado: "",
        cuestionario: "personalizado-a",
        orden: "fecha",
      }).map(({ id }) => id),
    ).toEqual(["3", "1"]);
  });
});
