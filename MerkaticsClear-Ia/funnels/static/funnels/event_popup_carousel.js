(() => {
  const dismissedKey = "event-popup-carousel-dismissed-v2";
  const returnKey = "event-popup-carousel-return";
  document.querySelectorAll("[data-popup-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        window.sessionStorage.removeItem(dismissedKey);
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    });
  });

  const carousel = document.querySelector("[data-popup-carousel]");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll("[data-popup-slide]")];
  const count = carousel.querySelector("[data-popup-count]");
  const indicators = carousel.querySelector("[data-popup-indicators]");
  const closeButtons = carousel.querySelectorAll("[data-popup-close]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let returnPopupKey = null;
  let activeIndex = 0;
  let previousOverflow = "";
  let previouslyFocused = null;

  try {
    if (window.sessionStorage.getItem(dismissedKey) === "1") {
      return;
    }
    returnPopupKey = window.sessionStorage.getItem(returnKey);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  if (!slides.length) return;

  function showSlide(index, moveFocus) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.hidden = slideIndex !== activeIndex;
    });
    const activeTitle = slides[activeIndex].querySelector("h2");
    if (activeTitle) {
      if (!activeTitle.id) activeTitle.id = `popup-title-${activeIndex}`;
      carousel.setAttribute("aria-labelledby", activeTitle.id);
    }
    count.textContent = `${activeIndex + 1} / ${slides.length}`;
    [...indicators.children].forEach((button, buttonIndex) => {
      button.setAttribute("aria-current", buttonIndex === activeIndex ? "true" : "false");
    });
    if (moveFocus) {
      const firstAction = slides[activeIndex].querySelector("a, button");
      if (firstAction) firstAction.focus();
    }
  }

  function close() {
    carousel.hidden = true;
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", handleKeydown);
    try {
      window.sessionStorage.setItem(dismissedKey, "1");
      window.sessionStorage.removeItem(returnKey);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showSlide(activeIndex + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      showSlide(activeIndex - 1, true);
    } else if (event.key === "Tab") {
      const focusable = [...carousel.querySelectorAll("a[href], button:not([disabled])")]
        .filter((element) => !element.closest("[hidden]"));
      if (!focusable.length) {
        event.preventDefault();
        carousel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  slides.forEach((_slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Mostrar popup ${index + 1}`);
    button.addEventListener("click", () => showSlide(index, true));
    indicators.append(button);
  });
  carousel.querySelector("[data-popup-previous]").addEventListener("click", () => {
    showSlide(activeIndex - 1, true);
  });
  carousel.querySelector("[data-popup-next]").addEventListener("click", () => {
    showSlide(activeIndex + 1, true);
  });
  closeButtons.forEach((button) => button.addEventListener("click", close));
  carousel.querySelectorAll("[data-popup-return-key]").forEach((link) => {
    link.addEventListener("click", () => {
      try {
        window.sessionStorage.setItem(returnKey, link.dataset.popupReturnKey);
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    });
  });
  carousel.addEventListener("click", (event) => {
    if (event.target === carousel) close();
  });

  const restoredIndex = returnPopupKey
    ? slides.findIndex((slide) => slide.dataset.popupKey === returnPopupKey)
    : -1;
  if (returnPopupKey && restoredIndex < 0) {
    try {
      window.sessionStorage.removeItem(returnKey);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
  showSlide(restoredIndex < 0 ? 0 : restoredIndex, false);
  const open = () => {
    previouslyFocused = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    carousel.hidden = false;
    document.addEventListener("keydown", handleKeydown);
    const initialFocus = slides[activeIndex].querySelector("button, a[href]");
    if (initialFocus) initialFocus.focus();
  };
  window.setTimeout(open, reduceMotion.matches ? 0 : 250);
})();
