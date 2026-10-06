import { useState, type FormEvent } from "react";
import type { Lead } from "../types/model";

export type DatosContacto = Pick<Lead, "nombre" | "correo" | "telefono">;

interface FormularioContactoProps {
  onCompletar: (datos: DatosContacto) => void;
}

export default function FormularioContacto({
  onCompletar,
}: FormularioContactoProps) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onCompletar({ nombre, correo, telefono });
  }

  return (
    <form className="contact-form" onSubmit={enviar}>
      <h2>Datos de contacto</h2>
      <label>
        Nombre
        <input
          autoComplete="name"
          onChange={(evento) => setNombre(evento.target.value)}
          required
          type="text"
          value={nombre}
        />
      </label>
      <label>
        Correo electrónico
        <input
          autoComplete="email"
          onChange={(evento) => setCorreo(evento.target.value)}
          required
          type="email"
          value={correo}
        />
      </label>
      <label>
        Teléfono / WhatsApp
        <input
          autoComplete="tel"
          onChange={(evento) => setTelefono(evento.target.value)}
          required
          type="tel"
          value={telefono}
        />
      </label>
      <button className="submit-button" type="submit">
        Continuar
      </button>
    </form>
  );
}
