import type { ReactNode } from "react";
import {
  debeMostrarEncabezado,
  obtenerTipoPie,
} from "../config/sitio";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

interface SiteFrameProps {
  pathname: string;
  esRegistroEvento?: boolean;
  children: ReactNode;
}

export default function SiteFrame({
  pathname,
  esRegistroEvento = false,
  children,
}: SiteFrameProps) {
  const tipoPie = obtenerTipoPie(pathname, esRegistroEvento);
  const mostrarEncabezado = debeMostrarEncabezado(
    pathname,
    esRegistroEvento,
  );

  return (
    <div className="site-frame" id="top">
      {mostrarEncabezado && <SiteHeader />}
      <div className="site-frame-content">{children}</div>
      {tipoPie !== "ninguno" && (
        <SiteFooter minimo={tipoPie === "minimo"} />
      )}
    </div>
  );
}
