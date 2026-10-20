import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const configuracionFirebase = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const variablesFaltantes = Object.entries(configuracionFirebase)
  .filter(([, valor]) => !valor)
  .map(([nombre]) => nombre);

export const firebaseApp =
  variablesFaltantes.length === 0
    ? initializeApp(configuracionFirebase)
    : null;

export const db = firebaseApp ? getFirestore(firebaseApp) : null;

if (variablesFaltantes.length > 0) {
  console.warn(
    `Conexión con Firebase desactivada; faltan variables: ${variablesFaltantes.join(", ")}.`,
  );
}
