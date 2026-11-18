import { useEffect, useRef, type ReactNode } from "react";

interface SiteDialogProps {
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
}

export default function SiteDialog({
  titulo,
  abierto,
  onCerrar,
  children,
}: SiteDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) {
      return;
    }

    const dialog = dialogRef.current;
    const elementoAnterior = document.activeElement;
    const elementos = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    elementos()[0]?.focus();

    function manejarTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onCerrar();
        return;
      }
      if (evento.key !== "Tab") {
        return;
      }

      const interactivos = elementos();
      const primero = interactivos[0];
      const ultimo = interactivos[interactivos.length - 1];
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
    return () => {
      document.removeEventListener("keydown", manejarTeclado);
      if (elementoAnterior instanceof HTMLElement) {
        elementoAnterior.focus();
      }
    };
  }, [abierto, onCerrar]);

  if (!abierto) {
    return null;
  }

  return (
    <div
      className="site-dialog-backdrop"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) {
          onCerrar();
        }
      }}
    >
      <section
        aria-labelledby="site-dialog-title"
        aria-modal="true"
        className="site-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="site-dialog-heading">
          <h2 id="site-dialog-title">{titulo}</h2>
          <button
            aria-label="Cerrar diálogo"
            className="site-dialog-close"
            onClick={onCerrar}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="site-dialog-content">{children}</div>
      </section>
    </div>
  );
}
