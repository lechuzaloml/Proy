import { useEffect, useRef, useState } from "react";
import { doc, getDocFromServer } from "firebase/firestore";
import RenderizadorCuestionario from "./RenderizadorCuestionario";
import PantallaResultado from "./PantallaResultado";
import { db } from "../lib/firebase";
import { enviarCopiaPublicada } from "../lib/publicacionCuestionarios";
import {
  calcularResultado,
  type RespuestasCuestionario,
  type ResultadoCalculado,
} from "../logic/calcularResultado";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";

interface CuestionarioPublicoProps {
  empresaId: string;
  cuestionarioId: string;
  versionId: string;
}

export default function CuestionarioPublico({
  empresaId,
  cuestionarioId,
  versionId,
}: CuestionarioPublicoProps) {
  const [cuestionario, setCuestionario] = useState<Cuestionario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [envioCompletado, setEnvioCompletado] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<{
    calculo: Extract<ResultadoCalculado, { estado: "ok" }>;
    respuestas: RespuestasCuestionario;
  } | null>(null);
  const submissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!db) {
        setError("El cuestionario no está disponible.");
        setCargando(false);
        return;
      }
      try {
        const referencia = doc(
          db,
          "empresas",
          empresaId,
          "cuestionarios",
          cuestionarioId,
          "versiones",
          versionId,
        );
        const snapshot = await getDocFromServer(referencia);
        if (!snapshot.exists()) {
          throw new Error("Esta versión del cuestionario ya no está publicada.");
        }
        const documento = snapshot.data();
        const validacion = validarCuestionario(documento.configuracion);
        if (
          documento.empresaId !== empresaId ||
          documento.cuestionarioId !== cuestionarioId ||
          documento.versionId !== versionId ||
          !validacion.valido ||
          validacion.data.id !== cuestionarioId
        ) {
          throw new Error("La configuración publicada no es válida.");
        }
        if (!cancelado) {
          setCuestionario(validacion.data);
        }
      } catch {
        if (!cancelado) {
          setError("No se pudo cargar el cuestionario. Es posible que ya no esté publicado.");
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [empresaId, cuestionarioId, versionId]);

  if (cargando) {
    return <main className="questionnaire"><p>Cargando cuestionario…</p></main>;
  }
  if (error || !cuestionario) {
    return (
      <main className="validation-errors" role="alert">
        <h1>Cuestionario no disponible</h1>
        <p>{error || "No se pudo cargar este cuestionario."}</p>
      </main>
    );
  }
  if (envioCompletado && resultadoFinal) {
    return (
      <PantallaResultado
        calculo={resultadoFinal.calculo}
        contenidoPersonalizado={null}
        cuestionario={cuestionario}
        errorPersonalizacion={null}
        respuestas={resultadoFinal.respuestas}
      />
    );
  }

  return (
    <>
      {error && <p className="validation-errors" role="alert">{error}</p>}
      <RenderizadorCuestionario
        cuestionario={cuestionario}
        personalizarResultados={false}
        requiereConsentimiento
        onEnvio={async (lead, resultado, respuestas) => {
          if (resultado.estado !== "ok" || enviando) {
            setError("No se pudo calcular el resultado del cuestionario.");
            return;
          }
          setError("");
          setEnviando(true);
          submissionIdRef.current ??= crypto.randomUUID();
          try {
            await enviarCopiaPublicada({
              empresaId,
              cuestionarioId,
              versionId,
              submissionId: submissionIdRef.current,
              contacto: {
                nombre: lead.nombre,
                correo: lead.correo,
                telefono: lead.telefono,
              },
              respuestas,
              consentimientoAceptado: true,
            });
            const calculo = calcularResultado(cuestionario, respuestas);
            if (calculo.estado !== "ok") {
              throw new Error("No se pudo recuperar el resultado enviado.");
            }
            setResultadoFinal({ calculo, respuestas });
            setEnvioCompletado(true);
          } catch (fallo: unknown) {
            setError(fallo instanceof Error
              ? fallo.message
              : "No se pudo enviar el cuestionario. Inténtalo nuevamente.");
          } finally {
            setEnviando(false);
          }
        }}
      />
    </>
  );
}
