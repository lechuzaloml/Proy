import { useEffect, useState } from "react";
import { doc, getDocFromServer, serverTimestamp } from "firebase/firestore";
import RenderizadorCuestionario from "./RenderizadorCuestionario";
import PantallaResultado from "./PantallaResultado";
import { db } from "../lib/firebase";
import { guardarDiagnostico } from "../lib/guardarDiagnostico";
import { construirDocumentosDiagnostico } from "../lib/construirDocumentosDiagnostico";
import {
  type RespuestasCuestionario,
  type ResultadoCalculado,
} from "../logic/calcularResultado";
import type { Cuestionario } from "../types/model";
import { validarCuestionario } from "../validation/validarCuestionario";

interface CuestionarioPublicoProps {
  empresaId: string;
  cuestionarioId: string;
}

export default function CuestionarioPublico({
  empresaId,
  cuestionarioId,
}: CuestionarioPublicoProps) {
  const [cuestionario, setCuestionario] = useState<Cuestionario | null>(null);
  const [versionId, setVersionId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [envioCompletado, setEnvioCompletado] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<{
    calculo: Extract<ResultadoCalculado, { estado: "ok" }>;
    respuestas: RespuestasCuestionario;
  } | null>(null);
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!empresaId || !cuestionarioId) {
        setError("Este cuestionario no está disponible.");
        setCargando(false);
        return;
      }
      if (!db) {
        setError("El cuestionario no está disponible.");
        setCargando(false);
        return;
      }
      try {
        const empresaSnapshot = await getDocFromServer(
          doc(db, "empresas", empresaId),
        );
        if (
          !empresaSnapshot.exists() ||
          empresaSnapshot.data().estado !== "activa"
        ) {
          throw new Error("empresa-no-disponible");
        }
        const cuestionarioRef = doc(
          db,
          "empresas",
          empresaId,
          "cuestionarios",
          cuestionarioId,
        );
        const cuestionarioSnapshot = await getDocFromServer(cuestionarioRef);
        if (!cuestionarioSnapshot.exists()) {
          throw new Error("cuestionario-no-publicado");
        }
        const documentoCuestionario = cuestionarioSnapshot.data();
        const actualVersionId = documentoCuestionario.versionActualId;
        if (
          documentoCuestionario.estado !== "publicado" ||
          typeof actualVersionId !== "string" ||
          actualVersionId.length < 1 ||
          actualVersionId.length > 40
        ) {
          throw new Error("cuestionario-no-publicado");
        }
        const versionSnapshot = await getDocFromServer(doc(
          cuestionarioRef,
          "versiones",
          actualVersionId,
        ));
        if (!versionSnapshot.exists()) {
          throw new Error("La versión actual del cuestionario no existe.");
        }
        const validacion = validarCuestionario(
          versionSnapshot.data().configuracion,
        );
        if (
          documentoCuestionario.id !== cuestionarioId ||
          !validacion.valido ||
          validacion.data.id !== cuestionarioId
        ) {
          throw new Error("La configuración publicada no es válida.");
        }
        if (!cancelado) {
          setCuestionario(validacion.data);
          setVersionId(actualVersionId);
        }
      } catch (fallo: unknown) {
        if (!cancelado) {
          const codigo = fallo && typeof fallo === "object" && "code" in fallo
            ? fallo.code
            : undefined;
          const noDisponible = fallo instanceof Error &&
            (fallo.message === "empresa-no-disponible" ||
              fallo.message === "cuestionario-no-publicado") ||
            codigo === "permission-denied";
          setError(noDisponible
            ? "Este cuestionario no está disponible. La empresa puede estar suspendida o el cuestionario ya no está publicado."
            : "No se pudo cargar el cuestionario. Inténtalo nuevamente.");
          console.error("No se pudo cargar el cuestionario público.", fallo);
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
  }, [empresaId, cuestionarioId]);

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
        unaPreguntaPorVista
        personalizarResultados={false}
        requiereConsentimiento
        onEnvio={async (lead, calculo, respuestas) => {
          if (calculo.estado !== "ok" || enviando) {
            setError("No se pudo calcular el resultado del cuestionario.");
            return;
          }
          setError("");
          setEnviando(true);
          const submissionId = crypto.randomUUID();
          setResultadoFinal({ calculo, respuestas });
          setEnvioCompletado(true);
          try {
            const resultadoGuardado = calculo.tipo === "segmentado"
              ? {
                  tipo: "por_segmento" as const,
                  resultados: [{
                    ...calculo.resultado,
                  }],
                }
              : {
                  tipo: "fijo" as const,
                  contenido: calculo.resultado.contenido,
                  ...("cta" in calculo.resultado && calculo.resultado.cta
                    ? { cta: calculo.resultado.cta }
                    : {}),
                };
            const documentos = construirDocumentosDiagnostico({
              empresaId,
              id: submissionId,
              contacto: {
                nombre: lead.nombre,
                correo: lead.correo,
                telefono: lead.telefono,
              },
              cuestionario,
              cuestionarioId,
              versionId,
              respuestas,
              ...(calculo.tipo === "segmentado"
                ? {
                    puntajeTotal: calculo.puntajeTotal,
                    segmento: calculo.segmento,
                  }
                : {}),
              templateRecomendadoId: "",
              planRecomendadoId: "",
              origen: "formulario-publico",
              resultado: resultadoGuardado,
              consentimientoAceptado: true,
              fecha: serverTimestamp(),
            });
            const guardado = await guardarDiagnostico(
              empresaId,
              submissionId,
              documentos,
            );
            if (!guardado) {
              throw new Error("La conexión con Firestore no está disponible.");
            }
          } catch (fallo: unknown) {
            console.error("No se pudo guardar el envío público.", fallo);
          } finally {
            setEnviando(false);
          }
        }}
      />
    </>
  );
}
