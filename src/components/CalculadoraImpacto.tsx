import { useState } from "react";

interface DatosCalculadora {
  prospectosMensuales: number;
  ticketPromedio: number;
  conversionPorcentaje: number;
  prospectosSinSeguimiento: number;
}

const datosIniciales: DatosCalculadora = {
  prospectosMensuales: 160,
  ticketPromedio: 5000,
  conversionPorcentaje: 5,
  prospectosSinSeguimiento: 40,
};

const formatoMoneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const maximoAnualPosible = 12 * 1000 * 100_000;

function presentarMoneda(valor: number): string {
  return formatoMoneda.format(valor);
}

export default function CalculadoraImpacto() {
  const [datos, setDatos] = useState(datosIniciales);
  const oportunidadesEstimadas =
    datos.prospectosSinSeguimiento * (datos.conversionPorcentaje / 100);
  const impactoMensual = oportunidadesEstimadas * datos.ticketPromedio;
  const impactoAnual = impactoMensual * 12;
  const proporcionSinSeguimiento =
    datos.prospectosMensuales === 0
      ? 0
      : Math.round(
          (datos.prospectosSinSeguimiento / datos.prospectosMensuales) * 100,
        );
  const ventasEstimadasActuales =
    datos.prospectosMensuales * (datos.conversionPorcentaje / 100);
  const valoresAcumulados = Array.from(
    { length: 12 },
    (_, indice) => impactoMensual * (indice + 1),
  );

  function actualizarDato<K extends keyof DatosCalculadora>(
    campo: K,
    valor: number,
  ) {
    setDatos((actuales) => {
      const siguientes = { ...actuales, [campo]: valor };
      siguientes.prospectosSinSeguimiento = Math.min(
        siguientes.prospectosSinSeguimiento,
        siguientes.prospectosMensuales,
      );
      return siguientes;
    });
  }

  return (
    <section
      aria-labelledby="impact-title"
      className="impact-page impact-embedded"
    >
      <header className="impact-heading">
        <p className="eyebrow">Impacto comercial estimado</p>
        <h2 id="impact-title">
          Explora cuánto potencial podrías estar dejando sin seguimiento
        </h2>
        <p>
          Ajusta los datos para estimar el valor de las oportunidades que no
          reciben continuidad. El cálculo es ilustrativo, no una garantía de
          ventas.
        </p>
      </header>

      <section aria-label="Calculadora de impacto comercial" className="impact-dashboard">
        <div className="impact-controls">
          <label className="impact-control" htmlFor="prospectos-mensuales">
            <span className="impact-control-heading">
              <span>Prospectos al mes</span>
              <output>{datos.prospectosMensuales}</output>
            </span>
            <input
              id="prospectos-mensuales"
              max="1000"
              min="10"
              onChange={(evento) =>
                actualizarDato("prospectosMensuales", Number(evento.target.value))
              }
              step="10"
              type="range"
              value={datos.prospectosMensuales}
            />
            <span className="impact-range-boundaries">
              <span>10</span>
              <span>1,000</span>
            </span>
          </label>

          <label className="impact-control" htmlFor="ticket-promedio">
            <span className="impact-control-heading">
              <span>Ticket promedio</span>
              <output>{presentarMoneda(datos.ticketPromedio)}</output>
            </span>
            <input
              id="ticket-promedio"
              max="100000"
              min="500"
              onChange={(evento) =>
                actualizarDato("ticketPromedio", Number(evento.target.value))
              }
              step="500"
              type="range"
              value={datos.ticketPromedio}
            />
            <span className="impact-range-boundaries">
              <span>$500</span>
              <span>$100,000</span>
            </span>
          </label>

          <label className="impact-control" htmlFor="conversion-actual">
            <span className="impact-control-heading">
              <span>De cada 100 prospectos, ¿cuántos compran?</span>
              <output>{datos.conversionPorcentaje}</output>
            </span>
            <input
              id="conversion-actual"
              max="100"
              min="0"
              onChange={(evento) =>
                actualizarDato("conversionPorcentaje", Number(evento.target.value))
              }
              step="1"
              type="range"
              value={datos.conversionPorcentaje}
            />
            <span className="impact-range-boundaries">
              <span>0</span>
              <span>100</span>
            </span>
          </label>

          <label className="impact-control" htmlFor="prospectos-sin-seguimiento">
            <span className="impact-control-heading">
              <span>Prospectos que se quedan sin seguimiento</span>
              <output>
                {datos.prospectosSinSeguimiento} de {datos.prospectosMensuales}
              </output>
            </span>
            <input
              id="prospectos-sin-seguimiento"
              max={datos.prospectosMensuales}
              min="0"
              onChange={(evento) =>
                actualizarDato(
                  "prospectosSinSeguimiento",
                  Number(evento.target.value),
                )
              }
              step="1"
              type="range"
              value={datos.prospectosSinSeguimiento}
            />
            <span className="impact-range-boundaries">
              <span>0</span>
              <span>{datos.prospectosMensuales}</span>
            </span>
          </label>

          <div aria-label="Resumen estimado" className="impact-summary">
            <article className="impact-stat">
              <span>Ventas actuales estimadas</span>
              <strong>{ventasEstimadasActuales.toFixed(1)}</strong>
              <small>por mes, según tu conversión</small>
            </article>
            <article className="impact-stat impact-stat-highlight">
              <span>Oportunidad mensual estimada</span>
              <strong>{presentarMoneda(impactoMensual)}</strong>
              <small>
                si los prospectos sin seguimiento convirtieran a la tasa actual
              </small>
            </article>
            <article className="impact-stat">
              <span>Proyección ilustrativa anual</span>
              <strong>{presentarMoneda(impactoAnual)}</strong>
              <small>al mantener estos datos durante 12 meses</small>
            </article>
          </div>
        </div>

        <div className="impact-visuals">
          <figure className="impact-prospect-figure">
            <figcaption>
              <span>
                Cada punto representa aproximadamente el 1% de tus prospectos
              </span>
              <span className="impact-legend">
                <span aria-hidden="true" className="impact-legend-dot" />
                Sin seguimiento ({proporcionSinSeguimiento}%)
              </span>
            </figcaption>
            <div
              aria-label={`${proporcionSinSeguimiento}% de los prospectos no tienen seguimiento`}
              className="impact-prospect-grid"
              role="img"
            >
              {Array.from({ length: 100 }, (_, indice) => (
                <span
                  className={
                    indice < proporcionSinSeguimiento
                      ? "impact-prospect-dot is-unfollowed"
                      : "impact-prospect-dot"
                  }
                  key={indice}
                />
              ))}
            </div>
          </figure>

          <figure className="impact-chart-figure">
            <figcaption>
              <span>Proyección acumulada ilustrativa a 12 meses</span>
              <span>Escala visual comprimida</span>
            </figcaption>
            <div
              aria-label={`La proyección acumulada ilustrativa es ${presentarMoneda(impactoAnual)} al mes 12, en escala visual comprimida.`}
              className="impact-chart"
              role="img"
            >
              {valoresAcumulados.map((valor, indice) => (
                <div className="impact-chart-column" key={indice}>
                  <span
                    className="impact-chart-bar"
                    style={{
                      height: `${Math.max(
                        (Math.log1p(valor) /
                          Math.log1p(maximoAnualPosible)) *
                          100,
                        valor > 0 ? 2 : 0,
                      )}%`,
                    }}
                    title={`Mes ${indice + 1}: ${presentarMoneda(valor)}`}
                  />
                  {(indice === 0 || indice === 5 || indice === 11) && (
                    <span className="impact-chart-label">
                      Mes {indice + 1}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="impact-chart-scale-note">
              Escala visual comprimida para que el gráfico siga reflejando
              aumentos en escenarios de distinto tamaño. Los importes exactos
              aparecen en el resumen y al pasar sobre cada barra.
            </p>
          </figure>

          <p className="impact-disclaimer">
            Estimación basada en los valores que ingresaste: prospectos sin
            seguimiento × conversión actual × ticket promedio. No representa
            ventas perdidas comprobadas ni garantiza resultados futuros.
          </p>
        </div>
      </section>

    </section>
  );
}
