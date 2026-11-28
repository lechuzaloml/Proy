document.querySelectorAll("[data-avatar-image]").forEach((image) => {
  const showFallback = () => {
    image.hidden = true;
    const fallback = image.parentElement.querySelector(".private-avatar-fallback");
    if (fallback) fallback.hidden = false;
  };
  if (image.complete && image.naturalWidth === 0) {
    showFallback();
  } else {
    image.addEventListener("error", showFallback, { once: true });
  }
});
