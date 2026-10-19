import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const configuracion = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const variablesFaltantes = Object.entries(configuracion)
  .filter(([, valor]) => !valor)
  .map(([nombre]) => nombre);

export const db =
  variablesFaltantes.length === 0
    ? getFirestore(initializeApp(configuracion))
    : null;

if (variablesFaltantes.length > 0) {
  console.warn(
    `Guardado de leads desactivado; faltan variables de Firebase: ${variablesFaltantes.join(", ")}.`,
  );
}
