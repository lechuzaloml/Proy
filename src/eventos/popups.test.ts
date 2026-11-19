import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { DIAS_GRACIA } from "../config/popups";
import {
  calcularVenceEn,
  crearDocumentoPopup,
  diagnosticarPopup,
  estaVencido,
  filtrarPopupsPublicadosActivos,
  formatearFechaEvento,
  limpiarCamposOpcionalesPopup,
  motivoDescartePopup,
  obtenerEstadoTrasEdicion,
  popupDesdeDatos,
  transicionarPopup,
  validarFormularioEvento,
  validarRegistroEvento,
  type ContextoDiagnosticoPopup,
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

function crearCasoDiagnostico() {
  const ahora = new Date();
  const contexto: ContextoDiagnosticoPopup = {
    rol: "propietario",
    estadoMiembro: "activo",
    sesionVerificada: true,
    empresaActiva: true,
    cuestionarioPublicado: true,
    ahora,
    actualizadoEnEsServerTimestamp: false,
  };
  const datos: Record<string, unknown> = {
    titulo: "Evento válido",
    resumen: "Descripción válida",
    cuestionarioId: "cuestionario-publicado",
    estado: "pendiente",
    actualizadoEn: Timestamp.fromDate(ahora),
    fechaEvento: Timestamp.fromDate(
      new Date(ahora.getTime() + 24 * 60 * 60 * 1000),
    ),
    venceEn: Timestamp.fromDate(
      new Date(ahora.getTime() + 48 * 60 * 60 * 1000),
    ),
    anfitrion: { nombre: "Anfitrión" },
  };
  return { ahora, contexto, datos };
}

describe("funciones puras de eventos por empresa", () => {
  it("diagnostica cada condición de las reglas de escritura de popups", () => {
    const casos: {
      nombre: string;
      modificar: (
        datos: Record<string, unknown>,
        contexto: ContextoDiagnosticoPopup,
      ) => void;
      mensaje: string;
    }[] = [
      {
        nombre: "campo superior no permitido",
        modificar: (datos) => { datos.campoExtra = true; },
        mensaje: "Hay campos no permitidos",
      },
      ...([
        ["titulo", "Falta el título."],
        ["resumen", "Falta el resumen."],
        ["cuestionarioId", "Falta el cuestionario."],
        ["estado", "Falta el estado."],
        ["actualizadoEn", "Falta la fecha de actualización."],
      ] as const).map(([campo, mensaje]) => ({
        nombre: `campo obligatorio ${campo}`,
        modificar: (datos: Record<string, unknown>) => {
          delete datos[campo];
        },
        mensaje,
      })),
      {
        nombre: "título fuera de longitud",
        modificar: (datos) => { datos.titulo = "x".repeat(81); },
        mensaje: "El título debe tener entre 1 y 80 caracteres.",
      },
      {
        nombre: "resumen fuera de longitud",
        modificar: (datos) => { datos.resumen = "x".repeat(301); },
        mensaje: "El resumen debe tener entre 1 y 300 caracteres.",
      },
      {
        nombre: "insignia opcional vacía",
        modificar: (datos) => { datos.insignia = ""; },
        mensaje: "La insignia no puede estar vacía",
      },
      {
        nombre: "insignia opcional larga",
        modificar: (datos) => { datos.insignia = "x".repeat(61); },
        mensaje: "La insignia no puede estar vacía",
      },
      {
        nombre: "fecha opcional vacía",
        modificar: (datos) => { datos.fecha = ""; },
        mensaje: "La fecha opcional debe tener entre 1 y 80 caracteres.",
      },
      {
        nombre: "fecha opcional larga",
        modificar: (datos) => { datos.fecha = "x".repeat(81); },
        mensaje: "La fecha opcional debe tener entre 1 y 80 caracteres.",
      },
      {
        nombre: "imagen no HTTPS",
        modificar: (datos) => { datos.imagenUrl = "http://example.com/a"; },
        mensaje: "La imagen debe ser una URL HTTPS",
      },
      {
        nombre: "imagen larga",
        modificar: (datos) => { datos.imagenUrl = `https://${"x".repeat(300)}`; },
        mensaje: "La imagen debe ser una URL HTTPS",
      },
      {
        nombre: "horarios no es lista",
        modificar: (datos) => { datos.horarios = "10:00"; },
        mensaje: "Los horarios deben ser una lista",
      },
      {
        nombre: "más de cuatro horarios",
        modificar: (datos) => { datos.horarios = [1, 2, 3, 4, 5]; },
        mensaje: "Los horarios deben ser una lista",
      },
      {
        nombre: "puntos no es lista",
        modificar: (datos) => { datos.puntos = {}; },
        mensaje: "Los puntos deben ser una lista",
      },
      {
        nombre: "más de cuatro puntos",
        modificar: (datos) => { datos.puntos = [1, 2, 3, 4, 5]; },
        mensaje: "Los puntos deben ser una lista",
      },
      {
        nombre: "anfitrión no es mapa",
        modificar: (datos) => { datos.anfitrion = []; },
        mensaje: "El anfitrión debe ser un objeto válido.",
      },
      {
        nombre: "campo de anfitrión no permitido",
        modificar: (datos) => {
          datos.anfitrion = { nombre: "Ana", correo: "ana@example.invalid" };
        },
        mensaje: "El anfitrión contiene campos no permitidos.",
      },
      {
        nombre: "nombre de anfitrión ausente",
        modificar: (datos) => { datos.anfitrion = {}; },
        mensaje: "El nombre del anfitrión debe tener entre 1 y 80 caracteres.",
      },
      {
        nombre: "nombre de anfitrión largo",
        modificar: (datos) => { datos.anfitrion = { nombre: "x".repeat(81) }; },
        mensaje: "El nombre del anfitrión debe tener entre 1 y 80 caracteres.",
      },
      {
        nombre: "foto opcional vacía",
        modificar: (datos) => {
          datos.anfitrion = { nombre: "Ana", fotoUrl: "" };
        },
        mensaje: "La foto del anfitrión debe ser HTTPS",
      },
      {
        nombre: "foto no HTTPS",
        modificar: (datos) => {
          datos.anfitrion = { nombre: "Ana", fotoUrl: "http://example.com/a" };
        },
        mensaje: "La foto del anfitrión debe ser HTTPS",
      },
      {
        nombre: "foto larga",
        modificar: (datos) => {
          datos.anfitrion = {
            nombre: "Ana",
            fotoUrl: `https://${"x".repeat(300)}`,
          };
        },
        mensaje: "La foto del anfitrión debe ser HTTPS",
      },
      {
        nombre: "fechaEvento con tipo incorrecto",
        modificar: (datos) => { datos.fechaEvento = "2026-01-02"; },
        mensaje: "La fecha del evento debe ser un timestamp.",
      },
      {
        nombre: "fechaEvento ausente en revisión",
        modificar: (datos) => { delete datos.fechaEvento; },
        mensaje: "La fecha del evento es obligatoria",
      },
      {
        nombre: "venceEn con tipo incorrecto",
        modificar: (datos) => { datos.venceEn = "2026-01-03"; },
        mensaje: "La fecha de vencimiento debe ser un timestamp.",
      },
      {
        nombre: "venceEn ausente en revisión",
        modificar: (datos) => { delete datos.venceEn; },
        mensaje: "La fecha de vencimiento es obligatoria",
      },
      {
        nombre: "vencimiento pasado",
        modificar: (datos, contexto) => {
          datos.venceEn = Timestamp.fromDate(
            new Date(contexto.ahora.getTime() - 1),
          );
        },
        mensaje: "La fecha de vencimiento debe estar en el futuro.",
      },
      {
        nombre: "vencimiento mayor a 400 días",
        modificar: (datos, contexto) => {
          datos.venceEn = Timestamp.fromDate(
            new Date(contexto.ahora.getTime() + 401 * 24 * 60 * 60 * 1000),
          );
        },
        mensaje: "La fecha de vencimiento no puede superar 400 días",
      },
      {
        nombre: "vencimiento anterior al evento",
        modificar: (datos, contexto) => {
          datos.fechaEvento = Timestamp.fromDate(
            new Date(contexto.ahora.getTime() + 3 * 24 * 60 * 60 * 1000),
          );
          datos.venceEn = Timestamp.fromDate(
            new Date(contexto.ahora.getTime() + 2 * 24 * 60 * 60 * 1000),
          );
        },
        mensaje: "La fecha de vencimiento no puede ser anterior",
      },
      {
        nombre: "ID de cuestionario vacío",
        modificar: (datos) => { datos.cuestionarioId = ""; },
        mensaje: "El ID del cuestionario debe tener entre 1 y 100 caracteres.",
      },
      {
        nombre: "ID de cuestionario largo",
        modificar: (datos) => { datos.cuestionarioId = "x".repeat(101); },
        mensaje: "El ID del cuestionario debe tener entre 1 y 100 caracteres.",
      },
      {
        nombre: "actualizadoEn distinto de la hora actual",
        modificar: (datos, contexto) => {
          datos.actualizadoEn = Timestamp.fromDate(
            new Date(contexto.ahora.getTime() + 1),
          );
        },
        mensaje: "La fecha de actualización debe coincidir",
      },
      {
        nombre: "sesión no verificada",
        modificar: (_datos, contexto) => { contexto.sesionVerificada = false; },
        mensaje: "La sesión de la cuenta debe estar verificada.",
      },
      {
        nombre: "rol no autorizado",
        modificar: (_datos, contexto) => { contexto.rol = "otro"; },
        mensaje: "Se requiere el rol de administrador",
      },
      {
        nombre: "miembro inactivo",
        modificar: (_datos, contexto) => { contexto.estadoMiembro = "inactivo"; },
        mensaje: "La membresía de la empresa debe estar activa.",
      },
      {
        nombre: "empresa inactiva",
        modificar: (_datos, contexto) => { contexto.empresaActiva = false; },
        mensaje: "La empresa debe estar activa.",
      },
      {
        nombre: "publicación por miembro de empresa",
        modificar: (datos) => { datos.estado = "publicado"; },
        mensaje: "Solo la plataforma puede publicar o rechazar",
      },
      {
        nombre: "estado desconocido",
        modificar: (datos) => { datos.estado = "archivado"; },
        mensaje: "El estado debe ser borrador, pendiente, publicado o rechazado.",
      },
      {
        nombre: "cuestionario no publicado",
        modificar: (_datos, contexto) => {
          contexto.cuestionarioPublicado = false;
        },
        mensaje: "El cuestionario debe estar publicado.",
      },
    ];

    for (const caso of casos) {
      const { datos, contexto } = crearCasoDiagnostico();
      caso.modificar(datos, contexto);
      expect(diagnosticarPopup(datos, contexto).join(" "), caso.nombre)
        .toContain(caso.mensaje);
    }
  });

  it("no encuentra errores en un popup válido ni aplica reglas no presentes", () => {
    const { contexto, datos } = crearCasoDiagnostico();
    datos.horarios = [null, {}, 1, "10:00"];
    datos.puntos = [null, {}, 1, "tema"];
    expect(diagnosticarPopup(datos, contexto)).toEqual([]);
  });

  it("respeta las excepciones de borrador y rechazado de las reglas", () => {
    const borrador = crearCasoDiagnostico();
    borrador.datos.estado = "borrador";
    delete borrador.datos.fechaEvento;
    delete borrador.datos.venceEn;
    borrador.contexto.cuestionarioPublicado = false;
    expect(diagnosticarPopup(borrador.datos, borrador.contexto)).toEqual([]);

    const rechazado = crearCasoDiagnostico();
    rechazado.datos.estado = "rechazado";
    delete rechazado.datos.fechaEvento;
    delete rechazado.datos.venceEn;
    rechazado.contexto.rol = "plataforma";
    rechazado.contexto.estadoMiembro = null;
    expect(diagnosticarPopup(rechazado.datos, rechazado.contexto)).toEqual([]);
  });

  it("permite a plataforma publicar y replica los límites temporales de reglas", () => {
    const plataforma = crearCasoDiagnostico();
    plataforma.contexto.rol = "plataforma";
    plataforma.contexto.estadoMiembro = null;
    plataforma.datos.estado = "publicado";
    plataforma.datos.fechaEvento = Timestamp.fromDate(
      new Date(plataforma.ahora.getTime() - 24 * 60 * 60 * 1000),
    );
    plataforma.datos.venceEn = Timestamp.fromDate(
      new Date(plataforma.ahora.getTime() + 400 * 24 * 60 * 60 * 1000),
    );
    expect(diagnosticarPopup(plataforma.datos, plataforma.contexto)).toEqual([]);
  });

  it("elimina campos opcionales vacíos o con solo espacios", () => {
    const datos = {
      ...crearDocumentoPopup(formularioValido, "borrador"),
      insignia: "   ",
      imagenUrl: " ",
      anfitrion: { nombre: "Anfitrión", fotoUrl: "  " },
    };
    const limpio = limpiarCamposOpcionalesPopup(datos);
    expect(limpio).not.toHaveProperty("insignia");
    expect(limpio).not.toHaveProperty("imagenUrl");
    expect(limpio.anfitrion).not.toHaveProperty("fotoUrl");
  });

  it("interpreta campos guardados de Firestore y conserva el ID del documento", () => {
    const fechaEvento = Timestamp.fromDate(new Date(2026, 0, 5, 10));
    const venceEn = Timestamp.fromDate(new Date(2026, 0, 6, 23, 59));
    const actualizadoEn = Timestamp.fromDate(new Date(2026, 0, 1));
    const popup = popupDesdeDatos("empresa-real-id", {
      titulo: "Evento vigente",
      resumen: "Descripción",
      cuestionarioId: "cuestionario-real-id",
      estado: "publicado",
      fechaEvento,
      venceEn,
      actualizadoEn,
    });

    expect(popup).toMatchObject({
      id: "empresa-real-id",
      estado: "publicado",
      cuestionarioId: "cuestionario-real-id",
      fechaEvento,
      venceEn,
      actualizadoEn,
    });
  });

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
      {
        id: "pendiente",
        estado: "pendiente" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-f",
      },
      {
        id: "rechazado",
        estado: "rechazado" as const,
        fechaEvento: Timestamp.fromDate(new Date(2026, 0, 5)),
        venceEn,
        cuestionarioId: "cuestionario-g",
      },
    ];
    expect(filtrarPopupsPublicadosActivos(
      popups,
      new Map([
        ["activa", true],
        ["inactiva", false],
        ["vencido", true],
        ["borrador", true],
        ["pendiente", true],
        ["rechazado", true],
      ]),
      new Map([
        ["activa/cuestionario-a", true],
        ["inactiva/cuestionario-b", true],
        ["borrador/cuestionario-e", true],
        ["pendiente/cuestionario-f", true],
        ["rechazado/cuestionario-g", true],
      ]),
      new Date(2026, 0, 1),
    )).toEqual([popups[0]]);
    expect(motivoDescartePopup(popups[2], true, false, new Date(2026, 0, 1)))
      .toBe("el cuestionario no está publicado");
  });
});
