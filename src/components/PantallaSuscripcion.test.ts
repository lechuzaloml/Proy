import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { recomendaciones } from "../config/recomendaciones";
import PantallaPlanes from "./PantallaPlanes";
import {
  crearCuerpoSolicitudInicio,
  resolverPlanInicial,
} from "./PantallaSuscripcion";

describe("plan seleccionado para iniciar la suscripción", () => {
  it("conserva el plan Avanzado de PantallaPlanes en el cuerpo de la solicitud", () => {
    const markup = renderToStaticMarkup(createElement(PantallaPlanes, {
      planes: Object.values(recomendaciones).map(({ plan }) => plan),
      planRecomendadoNombre: "Plan Avanzado",
    }));
    expect(markup).toContain('href="/suscripcion?plan=avanzado"');

    const seleccion = resolverPlanInicial("?plan=avanzado");
    const cuerpo = crearCuerpoSolicitudInicio(
      "empresa",
      "Empresa",
      seleccion.planId,
    );

    expect(seleccion).toEqual({ planId: "avanzado", mostrarSelector: false });
    expect(JSON.parse(cuerpo)).toEqual({
      slug: "empresa",
      nombre: "Empresa",
      planId: "avanzado",
    });
  });

  it("usa Pro por defecto y muestra el selector si no hay parámetro", () => {
    expect(resolverPlanInicial("")).toEqual({
      planId: "pro",
      mostrarSelector: true,
    });
  });

  it("ignora un plan inexistente y muestra el selector con Pro seleccionado", () => {
    expect(resolverPlanInicial("?plan=desconocido")).toEqual({
      planId: "pro",
      mostrarSelector: true,
    });
  });
});
