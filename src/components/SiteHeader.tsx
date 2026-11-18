import { useEffect, useRef, useState } from "react";
import { configuracionSitio } from "../config/sitio";

export default function SiteHeader() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuAbierto) {
      return;
    }
    const elementos = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
      );
    elementos()[0]?.focus();

    function manejarTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setMenuAbierto(false);
        botonMenuRef.current?.focus();
        return;
      }
      if (evento.key !== "Tab") {
        return;
      }

      const enlaces = elementos();
      const primero = enlaces[0];
      const ultimo = enlaces[enlaces.length - 1];
      if (!primero || !ultimo) {
        evento.preventDefault();
      } else if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", manejarTeclado);
    return () => document.removeEventListener("keydown", manejarTeclado);
  }, [menuAbierto]);

  function navegar(
    evento: React.MouseEvent<HTMLAnchorElement>,
    accion: string,
  ) {
    evento.preventDefault();
    if (menuAbierto) {
      botonMenuRef.current?.focus();
    }
    setMenuAbierto(false);
    window.dispatchEvent(
      new CustomEvent("site-navigation", { detail: accion }),
    );
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a
          aria-label={`${configuracionSitio.nombreSitio}, inicio`}
          className="site-wordmark"
          href="/"
          onClick={(evento) => navegar(evento, "inicio")}
        >
          {configuracionSitio.nombreSitio}
        </a>
        <button
          aria-controls="site-navigation"
          aria-expanded={menuAbierto}
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          className="site-menu-toggle"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
          ref={botonMenuRef}
          type="button"
        >
          <span aria-hidden="true">{menuAbierto ? "×" : "☰"}</span>
        </button>
        <nav
          aria-label="Navegación principal"
          className={`site-navigation${menuAbierto ? " is-open" : ""}`}
          id="site-navigation"
          ref={menuRef}
        >
          {configuracionSitio.navegacion.map(({ etiqueta, href, accion }) => (
            <a
              className="site-navigation-link"
              href={href}
              key={accion}
              onClick={(evento) => navegar(evento, accion)}
            >
              {etiqueta}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
