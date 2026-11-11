import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import diagnosticoInicial from "../../templates/assessments/diagnostico-inicial.json";
import type { RespuestaApi, SolicitudApi } from "../suscripcion/contratos.ts";
import {
  crearHandlerDespublicar,
  crearHandlerPublicar,
  type DependenciasPublicacion,
} from "./handlers.ts";

interface Referencia {
  path: string;
  campo?: string;
  valor?: unknown;
}

interface Escritura {
  tipo: "set" | "update";
  path: string;
  datos: Record<string, unknown>;
}

class FirestoreSimulado {
  documentos = new Map<string, Record<string, unknown>>();
  private colaTransacciones = Promise.resolve();

  doc(path: string): Referencia {
    return { path };
  }

  collection(path: string): Referencia & {
    where: (campo: string, operador: string, valor: unknown) => Referencia;
  } {
    return {
      path,
      where: (campo, operador, valor) => {
        if (operador !== "==") {
          throw new Error(`Operador no simulado: ${operador}`);
        }
        return { path, campo, valor };
      },
    };
  }

  async runTransaction<T>(
    actualizar: (transaccion: {
      get: (referencia: Referencia) => Promise<{
        exists: boolean;
        id: string;
        data: () => Record<string, unknown> | undefined;
        docs: {
          id: string;
          data: () => Record<string, unknown>;
        }[];
      }>;
      set: (referencia: Referencia, datos: Record<string, unknown>) => void;
      update: (referencia: Referencia, datos: Record<string, unknown>) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const anterior = this.colaTransacciones;
    let liberar!: () => void;
    this.colaTransacciones = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    await anterior;
    try {
      const escrituras: Escritura[] = [];
      const resultado = await actualizar({
        get: async (referencia) => {
          if (referencia.campo) {
            const prefijo = `${referencia.path}/`;
            const docs = [...this.documentos.entries()]
              .filter(([path, datos]) =>
                path.startsWith(prefijo) &&
                !path.slice(prefijo.length).includes("/") &&
                datos[referencia.campo!] === referencia.valor
              )
              .map(([path, datos]) => ({
                id: path.slice(prefijo.length),
                data: () => datos,
              }));
            return {
              exists: docs.length > 0,
              id: "",
              data: () => undefined,
              docs,
            };
          }
          const datos = this.documentos.get(referencia.path);
          return {
            exists: datos !== undefined,
            id: referencia.path.split("/").at(-1) ?? "",
            data: () => datos,
            docs: [],
          };
        },
        set: (referencia, datos) => {
          escrituras.push({ tipo: "set", path: referencia.path, datos });
        },
        update: (referencia, datos) => {
          escrituras.push({ tipo: "update", path: referencia.path, datos });
        },
      });
      for (const escritura of escrituras) {
        const anterior = this.documentos.get(escritura.path);
        if (escritura.tipo === "update" && !anterior) {
          throw new Error(`No existe ${escritura.path}`);
        }
        this.documentos.set(
          escritura.path,
          escritura.tipo === "update"
            ? { ...anterior, ...escritura.datos }
            : escritura.datos,
        );
      }
      return resultado;
    } finally {
      liberar();
    }
  }
}

class RespuestaSimulada implements RespuestaApi {
  codigo = 200;
  body: unknown;

  status(codigo: number): RespuestaApi {
    this.codigo = codigo;
    return this;
  }

  json(body: unknown): void {
    this.body = body;
  }
}

function solicitud(body: unknown): SolicitudApi {
  return Object.assign(Readable.from([]), {
    method: "POST",
    headers: { authorization: "Bearer token-test" },
    body,
  }) as SolicitudApi;
}

function prepararEmpresa(
  planId = "inicial",
  estado = "activa",
): FirestoreSimulado {
  const firestore = new FirestoreSimulado();
  firestore.documentos.set("empresas/empresa-a", { planId, estado });
  firestore.documentos.set("empresas/empresa-a/suscripcion/actual", {
    estado: "prueba",
  });
  firestore.documentos.set("empresas/empresa-a/miembros/editor@example.com", {
    correo: "editor@example.com",
    rol: "usuario",
    estado: "activo",
    permisos: {
      editarCuestionarios: true,
      publicarCuestionarios: true,
    },
  });
  return firestore;
}

function agregarCuestionario(
  firestore: FirestoreSimulado,
  id: string,
  estado: "borrador" | "publicado" = "borrador",
): void {
  firestore.documentos.set(`empresas/empresa-a/cuestionarios/${id}`, {
    id,
    nombre: `Cuestionario ${id}`,
    estado,
    configuracion: diagnosticoInicial,
    creadoPor: "editor@example.com",
  });
}

function crearDependencias(
  firestore: FirestoreSimulado,
  correo = "Editor@Example.com",
): DependenciasPublicacion {
  return {
    auth: {
      verifyIdToken: vi.fn().mockResolvedValue({
        email: correo,
        email_verified: true,
      }),
    },
    firestore: firestore as unknown as DependenciasPublicacion["firestore"],
    serverTimestamp: () => "server-time",
    crearIdVersion: () => "version-new",
  } as unknown as DependenciasPublicacion;
}

describe("endpoints transaccionales de publicación por empresa", () => {
  it("publica dentro del límite, crea la versión y devuelve el uso", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: ["ya-1", "ya-2"] },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, usados: 3, limite: 3 });
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo",
    )).toEqual(expect.objectContaining({
      estado: "publicado",
      versionActualId: "version-new",
    }));
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo/versiones/version-new",
    )).toEqual(expect.objectContaining({
      numero: 1,
      configuracion: diagnosticoInicial,
      creadoPor: "editor@example.com",
    }));
    expect(firestore.documentos.get("empresas/empresa-a/uso/cuestionarios"))
      .toEqual(expect.objectContaining({
        publicados: ["ya-1", "ya-2", "nuevo"],
      }));
  });

  it("rechaza la cuarta publicación en Inicial sin crear versión ni cambiar uso", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: ["ya-1", "ya-2", "ya-3"] },
    );
    agregarCuestionario(firestore, "cuarto");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "cuarto" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
    expect(respuesta.body).toEqual({
      error: "Alcanzaste el límite de tu plan: despublica uno o cambia de plan.",
    });
    expect(firestore.documentos.has(
      "empresas/empresa-a/cuestionarios/cuarto/versiones/version-new",
    )).toBe(false);
    expect(firestore.documentos.get("empresas/empresa-a/uso/cuestionarios"))
      .toEqual({ publicados: ["ya-1", "ya-2", "ya-3"] });
  });

  it.each([
    ["solo editar", { editarCuestionarios: true }],
    ["solo publicar", { publicarCuestionarios: true }],
  ])("deniega publicar si el miembro tiene %s", async (_caso, permisos) => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/miembros/editor@example.com",
      {
        estado: "activo",
        rol: "usuario",
        permisos,
      },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo",
    )?.estado).toBe("borrador");
  });

  it("permite al administrador de plataforma publicar con el mismo límite de la empresa", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.delete(
      "empresas/empresa-a/miembros/editor@example.com",
    );
    firestore.documentos.set(
      "plataformaAdmins/editor@example.com",
      { correo: "editor@example.com" },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, usados: 1, limite: 3 });
  });

  it("deniega publicar en empresa suspendida", async () => {
    const firestore = prepararEmpresa("inicial", "suspendida");
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo",
    )?.estado).toBe("borrador");
  });

  it("deniega publicar si el plan comercial no tiene suscripción activa ni en prueba", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/suscripcion/actual",
      { estado: "cancelada" },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo",
    )?.estado).toBe("borrador");
  });

  it("usa el límite Inicial para un plan desconocido", async () => {
    const firestore = prepararEmpresa("plan-obsoleto");
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: ["ya-1", "ya-2", "ya-3"] },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(403);
    expect(respuesta.body).toEqual({
      error: "Alcanzaste el límite de tu plan: despublica uno o cambia de plan.",
    });
  });

  it("falla cerrado si el contador existente no tiene una lista de ids válida", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: "malformado" },
    );
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(500);
    expect(respuesta.body).toEqual({
      error: "El registro de cupo de cuestionarios no tiene un formato válido.",
    });
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/nuevo",
    )?.estado).toBe("borrador");
  });

  it("permite publicaciones sin límite ni documento de suscripción en plan interno", async () => {
    const firestore = prepararEmpresa("interno");
    firestore.documentos.delete("empresas/empresa-a/suscripcion/actual");
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, usados: 1, limite: null });
  });

  it("serializa dos publicaciones simultáneas para no exceder el límite", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/miembros/admin@example.com",
      {
        correo: "admin@example.com",
        rol: "admin",
        estado: "activo",
        permisos: {},
      },
    );
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: ["ya-1", "ya-2"] },
    );
    agregarCuestionario(firestore, "primero");
    agregarCuestionario(firestore, "segundo");
    const handlerEditor = crearHandlerPublicar(
      crearDependencias(firestore, "editor@example.com"),
    );
    const handlerAdmin = crearHandlerPublicar(
      crearDependencias(firestore, "admin@example.com"),
    );
    const respuestas = [new RespuestaSimulada(), new RespuestaSimulada()];

    await Promise.all([
      handlerEditor(
        solicitud({ empresaId: "empresa-a", cuestionarioId: "primero" }),
        respuestas[0],
      ),
      handlerAdmin(
        solicitud({ empresaId: "empresa-a", cuestionarioId: "segundo" }),
        respuestas[1],
      ),
    ]);

    expect(respuestas.map(({ codigo }) => codigo).sort()).toEqual([200, 403]);
    expect(
      (firestore.documentos.get(
        "empresas/empresa-a/uso/cuestionarios",
      )?.publicados as string[]).length,
    ).toBe(3);
  });

  it("despublica y libera el cupo para otra publicación", async () => {
    const firestore = prepararEmpresa();
    firestore.documentos.set(
      "empresas/empresa-a/uso/cuestionarios",
      { publicados: ["uno", "dos", "tres"] },
    );
    agregarCuestionario(firestore, "tres", "publicado");
    agregarCuestionario(firestore, "nuevo");
    const despublicar = new RespuestaSimulada();

    await crearHandlerDespublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "tres" }),
      despublicar,
    );

    expect(despublicar.codigo).toBe(200);
    expect(despublicar.body).toEqual({ ok: true, usados: 2, limite: 3 });
    expect(firestore.documentos.get(
      "empresas/empresa-a/cuestionarios/tres",
    )?.estado).toBe("borrador");

    const publicar = new RespuestaSimulada();
    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      publicar,
    );
    expect(publicar.codigo).toBe(200);
    expect(publicar.body).toEqual({ ok: true, usados: 3, limite: 3 });
  });

  it("inicializa el contador a partir de los cuestionarios ya publicados", async () => {
    const firestore = prepararEmpresa();
    agregarCuestionario(firestore, "ya-publicado", "publicado");
    agregarCuestionario(firestore, "nuevo");
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, usados: 2, limite: 3 });
    expect(firestore.documentos.get("empresas/empresa-a/uso/cuestionarios"))
      .toEqual(expect.objectContaining({
        publicados: ["ya-publicado", "nuevo"],
      }));
  });

  it("rechaza datos extra del cliente y una identidad sin correo verificado", async () => {
    const firestore = prepararEmpresa();
    const dependencias = crearDependencias(firestore);
    const respuestaBody = new RespuestaSimulada();
    await crearHandlerPublicar(dependencias)(
      solicitud({
        empresaId: "empresa-a",
        cuestionarioId: "nuevo",
        planId: "interno",
      }),
      respuestaBody,
    );
    expect(respuestaBody.codigo).toBe(400);

    const respuestaAuth = new RespuestaSimulada();
    await crearHandlerPublicar({
      ...dependencias,
      auth: {
        verifyIdToken: vi.fn().mockResolvedValue({
          email: "editor@example.com",
          email_verified: false,
        }),
      },
    })(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "nuevo" }),
      respuestaAuth,
    );
    expect(respuestaAuth.codigo).toBe(403);
  });

  it("valida la configuración antes de crear una versión", async () => {
    const firestore = prepararEmpresa();
    agregarCuestionario(firestore, "invalido");
    firestore.documentos.set(
      "empresas/empresa-a/cuestionarios/invalido",
      {
        id: "invalido",
        estado: "borrador",
        configuracion: { preguntas: "no es un cuestionario" },
      },
    );
    const respuesta = new RespuestaSimulada();

    await crearHandlerPublicar(crearDependencias(firestore))(
      solicitud({ empresaId: "empresa-a", cuestionarioId: "invalido" }),
      respuesta,
    );

    expect(respuesta.codigo).toBe(400);
    expect(firestore.documentos.has(
      "empresas/empresa-a/cuestionarios/invalido/versiones/version-new",
    )).toBe(false);
  });
});
