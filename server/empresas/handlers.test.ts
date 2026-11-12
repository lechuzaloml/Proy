import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { RespuestaApi, SolicitudApi } from "../suscripcion/contratos.ts";
import type { DependenciasSuscripcion } from "../suscripcion/runtime.ts";
import { crearHandlerEliminarEmpresa } from "./handlers.ts";

class FirestoreSimulado {
  documentos = new Map<string, Record<string, unknown>>();
  eliminacionesRecursivas = 0;

  doc(path: string) {
    return {
      path,
      get: async () => this.snapshot(path),
      delete: async () => {
        this.documentos.delete(path);
      },
    };
  }

  collection(path: string) {
    const filtros: { campo: string; valor: unknown }[] = [];
    return {
      where: (campo: string, _operador: string, valor: unknown) => {
        filtros.push({ campo, valor });
        return this.collectionConFiltros(path, filtros);
      },
      get: async () => this.listar(path, filtros),
    };
  }

  private collectionConFiltros(
    path: string,
    filtros: { campo: string; valor: unknown }[],
  ) {
    return {
      where: (campo: string, _operador: string, valor: unknown) => {
        filtros.push({ campo, valor });
        return this.collectionConFiltros(path, filtros);
      },
      limit: (_cantidad: number) => this.collectionConFiltros(path, filtros),
      get: async () => this.listar(path, filtros),
    };
  }

  private listar(
    path: string,
    filtros: { campo: string; valor: unknown }[],
  ) {
    const prefijo = `${path}/`;
    const docs = [...this.documentos.entries()]
      .filter(([clave, datos]) =>
        clave.startsWith(prefijo) &&
        !clave.slice(prefijo.length).includes("/") &&
        filtros.every(({ campo, valor }) => datos[campo] === valor),
      )
      .map(([clave, datos]) => ({
        id: clave.slice(prefijo.length),
        data: () => datos,
        ref: this.doc(clave),
      }));
    return { docs, empty: docs.length === 0 };
  }

  private async snapshot(path: string) {
    const datos = this.documentos.get(path);
    return {
      exists: datos !== undefined,
      data: () => datos,
    };
  }

  async recursiveDelete(referencia: { path: string }) {
    this.eliminacionesRecursivas += 1;
    for (const path of this.documentos.keys()) {
      if (path === referencia.path || path.startsWith(`${referencia.path}/`)) {
        this.documentos.delete(path);
      }
    }
  }
}

class RespuestaSimulada implements RespuestaApi {
  codigo = 200;
  body: unknown;

  status(code: number): RespuestaApi {
    this.codigo = code;
    return this;
  }

  json(body: unknown): void {
    this.body = body;
  }
}

function solicitud(
  body: unknown,
  token = "token-valido",
): SolicitudApi {
  return Object.assign(Readable.from([]), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
  }) as SolicitudApi;
}

function crearDependencias() {
  const firestore = new FirestoreSimulado();
  firestore.documentos.set("plataformaAdmins/plataforma@example.com", {});
  const stripe = {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({ status: "active" }),
      cancel: vi.fn().mockResolvedValue({ status: "canceled" }),
    },
  };
  const dependencias = {
    auth: {
      verifyIdToken: vi.fn().mockResolvedValue({
        email: "Plataforma@example.com",
        email_verified: true,
      }),
    },
    firestore,
    stripe,
    stripeTestMode: true,
  } as unknown as DependenciasSuscripcion;
  return { dependencias, firestore, stripe };
}

async function eliminar(
  dependencias: DependenciasSuscripcion,
  body: unknown = { empresaId: "empresa-a", liberarPrueba: false },
) {
  const respuesta = new RespuestaSimulada();
  await crearHandlerEliminarEmpresa(dependencias)(solicitud(body), respuesta);
  return respuesta;
}

describe("POST /api/empresas/eliminar", () => {
  it("rechaza a usuarios que no son administradores de plataforma", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.delete("plataformaAdmins/plataforma@example.com");

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(403);
    expect(firestore.eliminacionesRecursivas).toBe(0);
  });

  it("rechaza empresas protegidas", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/clearia", { estado: "suspendida" });

    const respuesta = await eliminar(dependencias, {
      empresaId: "clearia",
      liberarPrueba: false,
    });

    expect(respuesta.codigo).toBe(400);
    expect(firestore.documentos.has("empresas/clearia")).toBe(true);
  });

  it("rechaza una empresa activa con propietario activo", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "activa" });
    firestore.documentos.set(
      "empresas/empresa-a/miembros/propietario@example.com",
      { estado: "activo", rol: "propietario" },
    );

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(409);
    expect(firestore.documentos.has("empresas/empresa-a")).toBe(true);
  });

  it("suspende y elimina recursivamente la empresa, cancelando Stripe", async () => {
    const { dependencias, firestore, stripe } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "suspendida" });
    firestore.documentos.set(
      "empresas/empresa-a/suscripcion/actual",
      { stripeSubscriptionId: "sub_test" },
    );
    firestore.documentos.set(
      "empresas/empresa-a/miembros/propietario@example.com",
      { estado: "activo", rol: "propietario" },
    );
    firestore.documentos.set("empresas/empresa-a/leads/lead-1", {});
    firestore.documentos.set(
      "empresas/empresa-a/cuestionarios/cuestionario-1/versiones/v1",
      {},
    );

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.body).toEqual({ ok: true });
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_test");
    expect([...firestore.documentos.keys()].some((path) =>
      path === "empresas/empresa-a" || path.startsWith("empresas/empresa-a/"),
    )).toBe(false);
  });

  it("permite eliminar una empresa activa sin propietario", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "activa" });
    firestore.documentos.set("empresas/empresa-a/miembros/miembro@example.com", {
      estado: "activo",
      rol: "editor",
    });

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(200);
    expect(firestore.documentos.has("empresas/empresa-a")).toBe(false);
  });

  it("no intenta cancelar una suscripción que Stripe ya canceló", async () => {
    const { dependencias, firestore, stripe } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "suspendida" });
    firestore.documentos.set(
      "empresas/empresa-a/suscripcion/actual",
      { stripeSubscriptionId: "sub_test" },
    );
    stripe.subscriptions.retrieve.mockResolvedValue({ status: "canceled" });

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("libera solo las pruebas asociadas cuando liberarPrueba es true", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "suspendida" });
    firestore.documentos.set("pruebas/duena@example.com", {
      slug: "empresa-a",
    });
    firestore.documentos.set("pruebas/otra@example.com", {
      slug: "otra-empresa",
    });

    const respuesta = await eliminar(dependencias, {
      empresaId: "empresa-a",
      liberarPrueba: true,
    });

    expect(respuesta.codigo).toBe(200);
    expect(firestore.documentos.has("pruebas/duena@example.com")).toBe(false);
    expect(firestore.documentos.has("pruebas/otra@example.com")).toBe(true);
  });

  it("conserva la prueba si liberarPrueba es false", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "suspendida" });
    firestore.documentos.set("pruebas/duena@example.com", {
      slug: "empresa-a",
    });

    const respuesta = await eliminar(dependencias);

    expect(respuesta.codigo).toBe(200);
    expect(firestore.documentos.has("pruebas/duena@example.com")).toBe(true);
  });

  it("es idempotente al repetir la eliminación", async () => {
    const { dependencias, firestore } = crearDependencias();
    firestore.documentos.set("empresas/empresa-a", { estado: "suspendida" });

    const primera = await eliminar(dependencias);
    const segunda = await eliminar(dependencias);

    expect(primera.codigo).toBe(200);
    expect(segunda.codigo).toBe(200);
    expect(segunda.body).toEqual({ ok: true });
  });
});
