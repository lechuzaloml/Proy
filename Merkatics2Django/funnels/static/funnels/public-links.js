(() => {
  document.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyLink);
        button.textContent = "Enlace copiado";
      } catch {
        button.textContent = "No se pudo copiar. Usa el enlace público.";
      }
    });
  });
})();
