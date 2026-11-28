(() => {
  const page = document.querySelector("[data-subscription-preparation]");
  if (!page) return;

  const message = page.querySelector("[data-preparation-message]");
  const retry = page.querySelector("[data-preparation-retry]");
  const endpoint = page.dataset.statusUrl;
  const slug = page.dataset.slug;
  const sessionId = new URL(window.location.href).searchParams.get("session_id") || "";
  let stopped = false;

  async function checkMembership() {
    stopped = false;
    retry.hidden = true;
    message.textContent =
      "Confirmando el registro de la empresa. Esta página puede tardar unos segundos.";
    const deadline = Date.now() + 30_000;

    while (!stopped && Date.now() < deadline) {
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("slug", slug);
        if (sessionId) url.searchParams.set("session_id", sessionId);
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(
            result && typeof result.error === "string"
              ? result.error
              : "No se pudo consultar la membresía de la empresa.",
          );
        }
        const result = await response.json();
        if (result.ready && typeof result.url === "string" && result.url.startsWith("/")) {
          const destination = new URL(result.url, window.location.origin);
          if (destination.origin === window.location.origin) {
            window.location.assign(destination.href);
            return;
          }
        }
      } catch (error) {
        message.textContent =
          error instanceof Error
            ? error.message
            : "No se pudo comprobar la membresía. Puedes volver a consultar en unos momentos.";
        retry.hidden = false;
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
    if (!stopped) {
      message.textContent =
        "La confirmación está tardando más de lo esperado. Puedes volver a consultar en unos momentos.";
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", () => void checkMembership());
  void checkMembership();
})();
