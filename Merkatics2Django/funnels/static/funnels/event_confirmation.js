document.querySelectorAll("[data-event-confirmation-image]").forEach((image) => {
  const showFallback = () => {
    const fallbackSrc = image.dataset.fallbackSrc;
    if (
      fallbackSrc &&
      !image.dataset.fallbackAttempted &&
      image.getAttribute("src") !== fallbackSrc
    ) {
      image.dataset.fallbackAttempted = "true";
      image.src = fallbackSrc;
      return;
    }

    image.classList.add("is-unavailable");
    const fallback = image.parentElement.querySelector(
      ".registro-evento__confirmacion-foto-fallback",
    );
    if (fallback) {
      fallback.removeAttribute("aria-hidden");
    }
  };

  image.addEventListener("error", showFallback);
  if (image.complete && image.naturalWidth === 0) {
    showFallback();
  }
});
