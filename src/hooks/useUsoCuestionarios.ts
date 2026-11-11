import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { limiteDePlan } from "../config/planes";

interface UsoCuestionarios {
  usados: number;
  limite: number;
  cargando: boolean;
  error: string;
}

function contarIdsPublicados(valor: unknown): number | null {
  if (!Array.isArray(valor) || !valor.every((id) => typeof id === "string")) {
    return null;
  }
  return new Set(valor).size;
}

export function useUsoCuestionarios(
  database: Firestore | null,
  empresaId: string,
  planId: string,
): UsoCuestionarios {
  const [usados, setUsados] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const limite = limiteDePlan(planId);

  useEffect(() => {
    if (!database || !empresaId) {
      setUsados(0);
      setCargando(false);
      setError("");
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError("");
    const referenciaUso = doc(
      database,
      "empresas",
      empresaId,
      "uso",
      "cuestionarios",
    );
    const desuscribir = onSnapshot(
      referenciaUso,
      (snapshot) => {
        if (cancelado) {
          return;
        }
        if (snapshot.exists()) {
          const cantidad = contarIdsPublicados(snapshot.data().publicados);
          if (cantidad === null) {
            setError("El contador de cuestionarios de la empresa no es válido.");
            setCargando(false);
            return;
          }
          setUsados(cantidad);
          setError("");
          setCargando(false);
          return;
        }

        void getDocsFromServer(query(
          collection(database, "empresas", empresaId, "cuestionarios"),
          where("estado", "==", "publicado"),
        ))
          .then((cuestionarios) => {
            if (!cancelado) {
              setUsados(cuestionarios.size);
              setError("");
              setCargando(false);
            }
          })
          .catch((errorLectura: unknown) => {
            if (!cancelado) {
              setError(
                errorLectura instanceof Error
                  ? `No se pudo leer el cupo de cuestionarios: ${errorLectura.message}`
                  : "No se pudo leer el cupo de cuestionarios.",
              );
              setCargando(false);
            }
          });
      },
      (errorLectura) => {
        if (!cancelado) {
          setError(`No se pudo leer el cupo de cuestionarios: ${errorLectura.message}`);
          setCargando(false);
        }
      },
    );

    return () => {
      cancelado = true;
      desuscribir();
    };
  }, [database, empresaId]);

  return { usados, limite, cargando, error };
}
