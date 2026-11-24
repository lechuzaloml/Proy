(() => {
  const dashboard = document.querySelector("[data-impact-calculator]");
  if (!dashboard) return;

  const currency = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const maxAnnualPossible = 12 * 1000 * 100_000;
  const inputs = Object.fromEntries(
    [...dashboard.querySelectorAll("[data-input]")].map((input) => [
      input.dataset.input,
      input,
    ]),
  );
  const outputs = Object.fromEntries(
    [...dashboard.querySelectorAll("[data-output]")].map((output) => [
      output.dataset.output,
      output,
    ]),
  );
  const prospectGrid = dashboard.querySelector("[data-prospect-grid]");
  const chart = dashboard.querySelector("[data-impact-chart]");
  const followupMaximum = dashboard.querySelector("[data-followup-maximum]");
  const proportionLabel = dashboard.querySelector("[data-proportion-label]");
  const prospectDots = document.createDocumentFragment();
  for (let index = 0; index < 100; index += 1) {
    const dot = document.createElement("span");
    dot.className = "impact-prospect-dot";
    prospectDots.append(dot);
  }
  prospectGrid.append(prospectDots);

  const chartColumns = document.createDocumentFragment();
  for (let index = 0; index < 12; index += 1) {
    const column = document.createElement("div");
    column.className = "impact-chart-column";
    const bar = document.createElement("span");
    bar.className = "impact-chart-bar";
    column.append(bar);
    if (index === 0 || index === 5 || index === 11) {
      const label = document.createElement("span");
      label.className = "impact-chart-label";
      label.textContent = `Mes ${index + 1}`;
      column.append(label);
    }
    chartColumns.append(column);
  }
  chart.append(chartColumns);

  const update = () => {
    const prospectosMensuales = Number(inputs.prospectosMensuales.value);
    const ticketPromedio = Number(inputs.ticketPromedio.value);
    const conversionPorcentaje = Number(inputs.conversionPorcentaje.value);
    const prospectosSinSeguimiento = Math.min(
      Number(inputs.prospectosSinSeguimiento.value),
      prospectosMensuales,
    );
    inputs.prospectosSinSeguimiento.max = String(prospectosMensuales);
    inputs.prospectosSinSeguimiento.value = String(prospectosSinSeguimiento);
    followupMaximum.textContent = String(prospectosMensuales);

    const oportunidadesEstimadas =
      prospectosSinSeguimiento * (conversionPorcentaje / 100);
    const impactoMensual = oportunidadesEstimadas * ticketPromedio;
    const impactoAnual = impactoMensual * 12;
    const proporcionSinSeguimiento = prospectosMensuales === 0
      ? 0
      : Math.round((prospectosSinSeguimiento / prospectosMensuales) * 100);
    const ventasEstimadasActuales =
      prospectosMensuales * (conversionPorcentaje / 100);

    outputs.prospectosMensuales.textContent = String(prospectosMensuales);
    outputs.ticketPromedio.textContent = currency.format(ticketPromedio);
    outputs.conversionPorcentaje.textContent = String(conversionPorcentaje);
    outputs.prospectosSinSeguimiento.textContent =
      `${prospectosSinSeguimiento} de ${prospectosMensuales}`;
    dashboard.querySelector('[data-summary="ventas"]').textContent =
      ventasEstimadasActuales.toFixed(1);
    dashboard.querySelector('[data-summary="mensual"]').textContent =
      currency.format(impactoMensual);
    dashboard.querySelector('[data-summary="anual"]').textContent =
      currency.format(impactoAnual);
    proportionLabel.textContent =
      `Sin seguimiento (${proporcionSinSeguimiento}%)`;
    [...prospectGrid.children].forEach((dot, index) => {
      dot.classList.toggle("is-unfollowed", index < proporcionSinSeguimiento);
    });
    prospectGrid.setAttribute(
      "aria-label",
      `${proporcionSinSeguimiento}% de los prospectos no tienen seguimiento`,
    );

    [...chart.children].forEach((column, index) => {
      const value = impactoMensual * (index + 1);
      const bar = column.querySelector(".impact-chart-bar");
      bar.style.height = `${Math.max(
        (Math.log1p(value) / Math.log1p(maxAnnualPossible)) * 100,
        value > 0 ? 2 : 0,
      )}%`;
      bar.title = `Mes ${index + 1}: ${currency.format(value)}`;
    });
    chart.setAttribute(
      "aria-label",
      `La proyección acumulada ilustrativa es ${currency.format(impactoAnual)} al mes 12, en escala visual comprimida.`,
    );
  };

  Object.values(inputs).forEach((input) => input.addEventListener("input", update));
  update();
})();
