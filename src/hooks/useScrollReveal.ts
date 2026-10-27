import { useCallback, useRef } from "react";

interface ScrollRevealOptions {
  staggerChildren?: boolean;
}

let observer: IntersectionObserver | null = null;
const observedElements = new Set<Element>();

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          entry.target.classList.add("scroll-reveal-visible");
          observedElements.delete(entry.target);
          observer?.unobserve(entry.target);
        }
        if (observedElements.size === 0) {
          observer?.disconnect();
          observer = null;
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
  }
  return observer;
}

export function useScrollReveal<T extends HTMLElement>(
  { staggerChildren = false }: ScrollRevealOptions = {},
) {
  const cleanup = useRef<(() => void) | null>(null);
  const ref = useCallback((element: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (
      !element ||
      typeof IntersectionObserver === "undefined" ||
      (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
    ) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const isInitiallyVisible =
      bounds.top < window.innerHeight * 0.92 && bounds.bottom > 0;
    element.classList.add("scroll-reveal-ready");
    if (staggerChildren) {
      element.classList.add("scroll-reveal-stagger");
    }

    if (isInitiallyVisible) {
      element.classList.add("scroll-reveal-visible");
      return;
    }

    try {
      const activeObserver = getObserver();
      observedElements.add(element);
      activeObserver.observe(element);
      cleanup.current = () => {
        activeObserver.unobserve(element);
        observedElements.delete(element);
        if (observedElements.size === 0) {
          activeObserver.disconnect();
          if (observer === activeObserver) {
            observer = null;
          }
        }
      };
    } catch (error: unknown) {
      element.classList.add("scroll-reveal-visible");
      observedElements.delete(element);
      if (observedElements.size === 0) {
        observer?.disconnect();
        observer = null;
      }
      console.warn("No se pudo observar el elemento para la animación de entrada.", error);
    }
  }, [staggerChildren]);

  return ref;
}
