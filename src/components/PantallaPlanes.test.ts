import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { recomendaciones } from "../config/recomendaciones";
import PantallaPlanes from "./PantallaPlanes";

describe("límites y beneficios visibles de los planes", () => {
  it("muestra el límite de cada plan y marca como disponibles las funciones existentes", () => {
    const markup = renderToStaticMarkup(createElement(PantallaPlanes, {
      planes: Object.values(recomendaciones).map(({ plan }) => plan),
      planRecomendadoNombre: "Plan Inicial",
    }));

    expect(markup).toContain("hasta 3 por empresa");
    expect(markup).toContain("hasta 10 por empresa");
    expect(markup).toContain("hasta 25 por empresa");
    expect(markup.match(/Precio de prueba: 1 USD/g)).toHaveLength(3);
    expect(markup).toContain("Almacenamiento y panel de tus leads");
    expect(markup).toContain("Personalización de tus propios cuestionarios");
    expect(markup).toContain("Conexión con el CRM y WhatsApp de Merkatics");
    expect(markup).toContain("Próximamente");
    expect(markup).toContain("/suscripcion?plan=inicial");
    expect(markup).toContain("/suscripcion?plan=pro");
    expect(markup).toContain("/suscripcion?plan=avanzado");
  });
});
