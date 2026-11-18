import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { DIAS_GRACIA } from "../config/popups";
import {
  calcularVenceEn,
  crearDocumentoPopup,
  estaVencido,
  filtrarPopupsPublicadosActivos,
  formatearFechaEvento,
  motivoDescartePopup,
  obtenerEstadoTrasEdicion,
  transicionarPopup,
  validarFormularioEvento,
  validarRegistroEvento,
  type FormularioPopup,
} from "./popups";

const formularioValido: FormularioPopup = {
  titulo: "Evento de prueba",
  insignia: "En vivo",
  resumen: "Un resumen breve.",
  imagenUrl: "",
  fecha: "2026-01-02",
  hora: "10:00",
  horarios: ["10:00"],
  anfitrionNombre: "Anfitriona",
  anfitrionFotoUrl: "https://example.invalid/foto.jpg",
  puntos: [{ titulo: "Tema", texto: "Descripción" }],
  cuestionarioId: "cuestionario-publicado",
};

describe("funciones puras de eventos por empresa", () => {
  it("valida longitudes, límites de listas y URLs HTTPS del formulario", () => {
    const ahora = new Date(2026, 0, 1, 12);
    expect(validarFormularioEvento(formularioValido, ahora)).toEqual([]);
    expect(validarFormularioEvento({
      ...formularioValido,
      imagenUrl: "http://example.invalid/imagen.jpg",
      horarios: ["1", "2", "3", "4", "5"],
    }, ahora)).toEqual(expect.arrayContaining(["horarios", "imagenUrl"]));
  });

  it("exige fecha y hora para revisión y rechaza fechas anteriores a hoy", () => {
    const ahora = new Date(2026, 0, 1, 12);
    expect(validarFormularioEvento({
      ...formularioValido,
      fecha: "",
      hora: "",
    }, ahora, true)).toContain("fechaEvento");
    expect(validarFormularioEvento({
      ...formularioValido,
      fecha: "2025-12-31",
    }, ahora)).toContain("fechaEvento");
    expect(validarFormularioEvento({
      ...formularioValido,
      fecha: "2027-02-05",
    }, ahora, true)).toContain("fechaEvento");
    expect(validarFormularioEvento({
      ...formularioValido,
      fecha: "",
      hora: "",
    }, ahora)).toEqual([]);
  });

  it("guarda timestamps reales y calcula el vencimiento al final del día de gracia", () => {
    const documento = crearDocumentoPopup(formularioValido, "pendiente");
    const fechaEvento = documento.fechaEvento?.toDate();
    expect(fechaEvento).toEqual(new Date(2026, 0, 2, 10));
    expect(documento).not.toHaveProperty("fecha");
    expect(documento.venceEn?.toDate()).toEqual(new Date(
      2026,
      0,
      2 + DIAS_GRACIA,
      23,
      59,
      59,
      999,
    ));
  });

  it("calcula el vencimiento, detecta vencidos y formatea la fecha en español", () => {
    const fechaEvento = Timestamp.fromDate(new Date(2026, 0, 15, 12, 30));
    const venceEn = calcularVenceEn(fechaEvento);
    expect(venceEn.toDate()).toEqual(new Date(
      2026,
      0,
      15 + DIAS_GRACIA,
      23,
      59,
      59,
      999,
    ));
    expect(estaVencido(
      { venceEn },
      new Date(2026, 0, 15, 23, 59),
    )).toBe(false);
    expect(estaVencido({ venceEn }, venceEn)).toBe(true);
    expect(estaVencido({})).toBe(true);
    expect(formatearFechaEvento(fechaEvento)).toContain(
      "15 de enero de 2026",
    );
  });

  it("valida el consentimiento y los datos del registro contra los horarios del evento", () => {
    const registro = {
      nombre: "Ana",
      apellido: "Pérez",
      correo: "ana@example.invalid",
      telefono: "+52 555 123 4567",
      horario: "10:00",
      consentimientoAceptado: true,
    };
    expect(validarRegistroEvento(registro, ["10:00"])).toEqual([]);
    expect(validarRegistroEvento({
      ...registro,
      horario: "11:00",
      consentimientoAceptado: false,
    }, ["10:00"])).toEqual(["horario", "consentimientoAceptado"]);
  });

  it("limita las transiciones según rol y pone en revisión las ediciones publicadas", () => {
    expect(transicionarPopup("admin", "borrador", "enviar-revision"))
      .toBe("pendiente");
    expect(transicionarPopup("admin", "pendiente", "aprobar")).toBeNull();
    expect(transicionarPopup("plataforma", "pendiente", "aprobar"))
      .toBe("publicado");
    expect(transicionarPopup("plataforma", "publicado", "despublicar"))
      .toBe("borrador");
    expect(obtenerEstadoTrasEdicion("publicado")).toBe("pendiente");
    expect(obtenerEstadoTrasEdicion("borrador")).toBe("borrador");
  });

  it("descarta vencidos, empresas inactivas y cuestionarios no publicados", () => {
    const venceEn = Timestamp.fromDate(new Date(2027, 0, 1));
    const popups = [
      {
        id: "activa",
        estado: "publicado" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-a",
      },
      {
        id: "inactiva",
        estado: "publicado" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-b",
      },
      {
        id: "sin-cuestionario",
        estado: "publicado" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-c",
      },
      {
        id: "vencido",
        estado: "publicado" as const,
        fechaEvento: Timestamp.fromDate(new Date(2024, 11, 30)),
        venceEn: Timestamp.fromDate(new Date(2025, 0, 1)),
        cuestionarioId: "cuestionario-d",
      },
      {
        id: "borrador",
        estado: "borrador" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-e",
      },
    ];
    expect(filtrarPopupsPublicadosActivos(
      popups,
      new Map([["activa", true], ["inactiva", false], ["vencido", true]]),
      new Map([["activa/cuestionario-a", true], ["inactiva/cuestionario-b", true]]),
      new Date(2026, 0, 1),
    )).toEqual([popups[0]]);
    expect(motivoDescartePopup(popups[2], true, false, new Date(2026, 0, 1)))
      .toBe("el cuestionario no está publicado");
  });
});
