import { useState, type FormEvent } from "react";
import type { Lead } from "../types/model";

export type DatosContacto = Pick<Lead, "nombre" | "correo" | "telefono">;

interface FormularioContactoProps {
  datosIniciales?: DatosContacto;
  onCambio?: (datos: DatosContacto) => void;
  onCompletar: (datos: DatosContacto) => void;
  deshabilitado?: boolean;
}

const DATOS_VACIOS: DatosContacto = {
  nombre: "",
  correo: "",
  telefono: "",
};

export default function FormularioContacto({
  datosIniciales,
  onCambio,
  onCompletar,
  deshabilitado = false,
}: FormularioContactoProps) {
  const [datos, setDatos] = useState(datosIniciales ?? DATOS_VACIOS);

  function actualizarDato(campo: keyof DatosContacto, valor: string) {
    const siguientesDatos = { ...datos, [campo]: valor };
    setDatos(siguientesDatos);
    onCambio?.(siguientesDatos);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onCompletar(datos);
  }

  return (
    <form className="contact-form" onSubmit={enviar}>
      <h2>Datos de contacto</h2>
      <label>
        Nombre
        <input
          autoComplete="name"
          disabled={deshabilitado}
          onChange={(evento) => actualizarDato("nombre", evento.target.value)}
          required
          type="text"
          value={datos.nombre}
        />
      </label>
      <label>
        Correo electrónico
        <input
          autoComplete="email"
          disabled={deshabilitado}
          onChange={(evento) => actualizarDato("correo", evento.target.value)}
          required
          type="email"
          value={datos.correo}
        />
      </label>
      <label>
        Teléfono / WhatsApp
        <input
          autoComplete="tel"
          disabled={deshabilitado}
          onChange={(evento) => actualizarDato("telefono", evento.target.value)}
          required
          type="tel"
          value={datos.telefono}
        />
      </label>
      <button className="submit-button" disabled={deshabilitado} type="submit">
        {deshabilitado ? "Generando resultado…" : "Continuar"}
      </button>
    </form>
  );
}
