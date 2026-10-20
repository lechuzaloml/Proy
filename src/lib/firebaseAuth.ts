import { getAuth } from "firebase/auth";
import { firebaseApp } from "./firebase";

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
