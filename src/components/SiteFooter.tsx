import { useState } from "react";
import {
  configuracionSitio,
  textoDerechosAutor,
} from "../config/sitio";
import {
  TEXTO_AVISO_PRIVACIDAD,
  VERSION_AVISO_PRIVACIDAD,
} from "../config/privacidad";
import SiteDialog from "./SiteDialog";

type DialogoLegal = "privacidad" | "terminos" | null;

interface SiteFooterProps {
  minimo?: boolean;
}

export default function SiteFooter({ minimo = false }: SiteFooterProps) {
  const [dialogo, setDialogo] = useState<DialogoLegal>(null);
  const pie = configuracionSitio.pie;
  const contacto = [
    pie.contacto.correo
      ? { href: `mailto:${pie.contacto.correo}`, texto: pie.contacto.correo }
      : null,
    pie.contacto.telefono
      ? {
        href: `tel:${pie.contacto.telefono}`,
        texto: pie.contacto.telefono,
      }
      : null,
  ].filter((dato): dato is { href: string; texto: string } => dato !== null);

  function navegar(
    evento: React.MouseEvent<HTMLAnchorElement>,
    accion: string,
  ) {
    evento.preventDefault();
    window.dispatchEvent(
      new CustomEvent("site-navigation", { detail: accion }),
    );
  }

  return (
    <>
      <footer className={`site-footer${minimo ? " site-footer-minimal" : ""}`}>
        {!minimo && (
          <div className="site-footer-main">
            <section aria-label="Acerca de la plataforma" className="site-footer-intro">
              <a
                className="site-wordmark"
                href="/"
                onClick={(evento) => navegar(evento, "inicio")}
              >
                {configuracionSitio.nombreSitio}
              </a>
              <p>{pie.frase}</p>
              {contacto.length > 0 && (
                <address>
                  {contacto.map(({ href, texto }) => (
                    <a href={href} key={href}>{texto}</a>
                  ))}
                </address>
              )}
            </section>
            {pie.columnas.map((columna) => (
              <nav
                aria-label={columna.titulo}
                className="site-footer-column"
                key={columna.titulo}
              >
                <h2>{columna.titulo}</h2>
                <ul>
                  {columna.enlaces.map((enlace) => (
                    <li key={enlace.etiqueta}>
                      {"accion" in enlace
                        ? (
                          <a
                            href={enlace.href}
                            onClick={(evento) =>
                              navegar(evento, enlace.accion)
                            }
                          >
                            {enlace.etiqueta}
                          </a>
                        )
                        : (
                          <button
                            className="site-footer-legal-link"
                            onClick={() => setDialogo(enlace.dialogo)}
                            type="button"
                          >
                            {enlace.etiqueta}
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        )}
        {!minimo && pie.mostrarAvisoPagosPrueba && (
          <p className="site-demo-note">
            Entorno de demostración: los pagos son de prueba
          </p>
        )}
        <div className="site-footer-bottom">
          <p>{textoDerechosAutor()}</p>
          {!minimo && (
            <a className="site-back-to-top" href="#top">
              Volver arriba
            </a>
          )}
        </div>
      </footer>
      <SiteDialog
        abierto={dialogo === "privacidad"}
        onCerrar={() => setDialogo(null)}
        titulo="Aviso de privacidad"
      >
        <p>{TEXTO_AVISO_PRIVACIDAD}</p>
        <p className="site-dialog-version">Versión: {VERSION_AVISO_PRIVACIDAD}</p>
      </SiteDialog>
      <SiteDialog
        abierto={dialogo === "terminos"}
        onCerrar={() => setDialogo(null)}
        titulo="Términos de uso"
      >
        <p>Pendiente de definición por Merkatics.</p>
      </SiteDialog>
    </>
  );
}
