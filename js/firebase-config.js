// ============================================================
// BOE 2.0 — Conexión a Firebase
// Este archivo se importa desde cualquier módulo que necesite
// acceder a Authentication, Firestore o Storage.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBBLT8jtMVGnM-g8YJV52m-ZvARqdIzukY",
  authDomain: "boe20-58028.firebaseapp.com",
  projectId: "boe20-58028",
  storageBucket: "boe20-58028.firebasestorage.app",
  messagingSenderId: "1059468588175",
  appId: "1:1059468588175:web:e515bf7d7f55f8ad88acfa"
};

// Inicializar Firebase una sola vez para toda la aplicación
const app = initializeApp(firebaseConfig);

// Servicios que exportamos al resto de módulos
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
