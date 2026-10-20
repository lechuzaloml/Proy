import { useState, type FormEvent } from "react";
import type { Lead } from "../types/model";
import { TEXTO_AVISO_PRIVACIDAD } from "../config/privacidad";

export type DatosContacto = Pick<Lead, "nombre" | "correo" | "telefono">;

interface FormularioContactoProps {
  datosIniciales?: DatosContacto;
  onCambio?: (datos: DatosContacto) => void;
  onCompletar: (datos: DatosContacto) => void;
  deshabilitado?: boolean;
  requiereConsentimiento?: boolean;
  consentimientoAceptado?: boolean;
  onConsentimientoChange?: (aceptado: boolean) => void;
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
  requiereConsentimiento = false,
  consentimientoAceptado = false,
  onConsentimientoChange,
}: FormularioContactoProps) {
  const [datos, setDatos] = useState(datosIniciales ?? DATOS_VACIOS);

  function actualizarDato(campo: keyof DatosContacto, valor: string) {
    const siguientesDatos = { ...datos, [campo]: valor };
    setDatos(siguientesDatos);
    onCambio?.(siguientesDatos);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (requiereConsentimiento && !consentimientoAceptado) {
      return;
    }
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
          maxLength={120}
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
          maxLength={200}
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
          maxLength={30}
          minLength={5}
          onChange={(evento) => actualizarDato("telefono", evento.target.value)}
          required
          type="tel"
          value={datos.telefono}
        />
      </label>
      {requiereConsentimiento ? (
        <div className="privacy-consent">
          <details>
            <summary>Leer aviso de privacidad</summary>
            <p>{TEXTO_AVISO_PRIVACIDAD}</p>
          </details>
          <label>
            <input
              checked={consentimientoAceptado}
              disabled={deshabilitado}
              onChange={(evento) =>
                onConsentimientoChange?.(evento.target.checked)
              }
              required
              type="checkbox"
            />
            <span>
              He leído el aviso y consiento el uso de mis datos para los fines
              descritos.
            </span>
          </label>
        </div>
      ) : (
        <p className="demo-notice">Demostración: no se guardan datos.</p>
      )}
      <button
        className="submit-button"
        disabled={
          deshabilitado ||
          (requiereConsentimiento && !consentimientoAceptado)
        }
        type="submit"
      >
        {deshabilitado ? "Generando resultado…" : "Continuar"}
      </button>
    </form>
  );
}
