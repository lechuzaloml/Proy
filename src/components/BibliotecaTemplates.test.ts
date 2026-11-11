import { createElement } from "react";
import { Timestamp } from "firebase/firestore";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { validarCuestionario } from "../validation/validarCuestionario";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import {
  puedeBorrarBorrador,
  puedeEditarBorrador,
  puedePublicar,
} from "../lib/permisosCuestionarios";
import type { DocumentoCuestionarioGuardado } from "../lib/documentoCuestionario";
import BibliotecaTemplates from "./BibliotecaTemplates";

const validacion = validarCuestionario(diagnosticoInicial);
if (!validacion.valido) {
  throw new Error("El fixture debe ser un cuestionario válido.");
}

const ahora = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

function copia(
  id: string,
  estado: DocumentoCuestionarioGuardado["estado"],
  creadoPor: string,
): DocumentoCuestionarioGuardado {
  return {
    id,
    nombre: `Cuestionario ${id}`,
    estado,
    ...(estado === "publicado" ? { versionActualId: "v1" } : {}),
    configuracion: validacion.data,
    creadoPor,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

const borradorEditor = copia(
  "personalizado-editor",
  "borrador",
  "editor@example.invalid",
);
const borradorAjeno = copia(
  "personalizado-ajeno",
  "borrador",
  "otra@example.invalid",
);
const publicado = copia(
  "personalizado-publicado",
  "publicado",
  "otra@example.invalid",
);

function renderBiblioteca({
  copiasGuardadas,
  correo,
  rol,
  permisos,
  usoCuestionarios,
}: {
  copiasGuardadas: DocumentoCuestionarioGuardado[];
  correo: string;
  rol: "usuario" | "propietario";
  permisos: { editarCuestionarios?: boolean; publicarCuestionarios?: boolean };
  usoCuestionarios?: {
    usados: number;
    limite: number;
    cargando: boolean;
    error: string;
  };
}) {
  return renderToStaticMarkup(createElement(BibliotecaTemplates, {
    templates: [],
    casosReferencia: [],
    copiasGuardadas,
    cargandoCopias: false,
    errorBiblioteca: "",
    accesoCuenta: null,
    onCrearCopia: vi.fn(),
    onAbrirCopia: vi.fn(),
    puedeEditarCopia: (item) =>
      item.estado === "borrador" &&
      puedeEditarBorrador(rol, permisos, item.creadoPor, correo),
    puedeBorrarCopia: (item) =>
      item.estado === "borrador" &&
      puedeBorrarBorrador(rol, permisos, item.creadoPor, correo),
    onEliminarCopia: vi.fn(),
    puedePublicar: puedePublicar(rol, permisos),
    onPublicarCopia: vi.fn(),
    onDespublicarCopia: vi.fn(),
    usoCuestionarios,
    onSeleccionar: vi.fn(),
  }));
}

describe("controles visibles de copias según el permiso del usuario", () => {
  it("usuario solo editor ve sus borradores, puede editarlos y borrarlos, pero pide publicación", () => {
    const markup = renderBiblioteca({
      copiasGuardadas: [borradorEditor],
      correo: "EDITOR@example.invalid",
      rol: "usuario",
      permisos: { editarCuestionarios: true },
    });

    expect(markup).toContain("Creado por editor@example.invalid");
    expect(markup).toContain("Abrir y editar");
    expect(markup).toContain("Eliminar");
    expect(markup).toContain("Pide la publicación a un administrador.");
    expect(markup).not.toContain(">Publicar</button>");
  });

  it("usuario con editar y publicar puede publicar borradores ajenos sin editarlos ni eliminarlos", () => {
    const markup = renderBiblioteca({
      copiasGuardadas: [borradorEditor, borradorAjeno, publicado],
      correo: "editor@example.invalid",
      rol: "usuario",
      permisos: {
        editarCuestionarios: true,
        publicarCuestionarios: true,
      },
    });

    expect(markup.match(/>Abrir y editar<\/button>/g)).toHaveLength(1);
    expect(markup.match(/>Eliminar<\/button>/g)).toHaveLength(1);
    expect(markup.match(/>Publicar<\/button>/g)).toHaveLength(2);
    expect(markup).toContain(">Despublicar</button>");
    expect(markup).toContain("Despublica primero");
    expect(markup).toContain("Creado por otra@example.invalid");
  });

  it("propietario puede editar y borrar borradores ajenos, publicar y despublicar", () => {
    const markup = renderBiblioteca({
      copiasGuardadas: [borradorEditor, borradorAjeno, publicado],
      correo: "owner@example.invalid",
      rol: "propietario",
      permisos: {},
    });

    expect(markup.match(/>Abrir y editar<\/button>/g)).toHaveLength(2);
    expect(markup.match(/>Eliminar<\/button>/g)).toHaveLength(2);
    expect(markup.match(/>Publicar<\/button>/g)).toHaveLength(2);
    expect(markup).toContain(">Despublicar</button>");
    expect(markup).toContain("Despublica primero");
  });

  it("muestra el uso y deshabilita publicar cuando se alcanza el cupo", () => {
    const markup = renderBiblioteca({
      copiasGuardadas: [borradorEditor],
      correo: "owner@example.invalid",
      rol: "propietario",
      permisos: {},
      usoCuestionarios: {
        usados: 3,
        limite: 3,
        cargando: false,
        error: "",
      },
    });

    expect(markup).toContain("Cuestionarios publicados: 3 de 3");
    expect(markup).toContain(
      "Alcanzaste el límite de tu plan: despublica uno o cambia de plan.",
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/);
  });
});
