import { describe, expect, it } from "vitest";
import {
  filtrarPopupsPublicadosActivos,
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
  fecha: "20 de mayo",
  horarios: ["10:00"],
  anfitrionNombre: "Anfitriona",
  anfitrionFotoUrl: "https://example.invalid/foto.jpg",
  puntos: [{ titulo: "Tema", texto: "Descripción" }],
  cuestionarioId: "cuestionario-publicado",
};

describe("funciones puras de eventos por empresa", () => {
  it("valida longitudes, límites de listas y URLs HTTPS del formulario", () => {
    expect(validarFormularioEvento(formularioValido)).toEqual([]);
    expect(validarFormularioEvento({
      ...formularioValido,
      imagenUrl: "http://example.invalid/imagen.jpg",
      horarios: ["1", "2", "3", "4", "5"],
    })).toEqual(expect.arrayContaining(["horarios", "imagenUrl"]));
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

  it("filtra elementos no publicados y empresas inactivas", () => {
    const popups = [
      { id: "activa", estado: "publicado" },
      { id: "inactiva", estado: "publicado" },
      { id: "borrador", estado: "borrador" },
    ];
    expect(filtrarPopupsPublicadosActivos(
      popups,
      new Map([["activa", true], ["inactiva", false]]),
    )).toEqual([popups[0]]);
  });
});
