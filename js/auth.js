// ══════════════════════════════════════════════════════════
// BOE 2.0 — Autenticación
// Login, registro, recuperar contraseña, mostrar/ocultar
// contraseña y "recordar sesión". main.js decide qué pantalla
// se muestra según el estado de la sesión.
// ══════════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile, setPersistence,
  browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ---------- Traducción de errores de Firebase ----------
export function errorAuth(code) {
  const m = {
    "auth/invalid-credential": "Correo o contraseña incorrectos. Verifica tus datos.",
    "auth/user-not-found": "No existe una cuenta con este correo.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-email": "El correo no tiene un formato válido.",
    "auth/email-already-in-use": "Ya existe una cuenta con este correo. Intenta iniciar sesión.",
    "auth/weak-password": "La contraseña es muy débil. Usa mínimo 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
    "auth/requires-recent-login": "Por seguridad, vuelve a iniciar sesión para hacer este cambio."
  };
  return m[code] || "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

// ---------- Inicializa toda la pantalla de autenticación ----------
export function iniciarAuth() {
  // Cambiar entre vistas (login / registro / recuperar)
  const vistas = {
    login: document.getElementById("view-login"),
    register: document.getElementById("view-register"),
    reset: document.getElementById("view-reset")
  };

  const mostrarVista = (nombre) => {
    Object.values(vistas).forEach((v) => v.classList.remove("active"));
    vistas[nombre].classList.add("active");
    limpiarAlertas();
  };

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => mostrarVista(btn.dataset.goto));
  });

  // Mostrar / ocultar contraseña
  const ojoAbierto = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const ojoCerrado = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    btn.innerHTML = ojoAbierto;
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      btn.innerHTML = visible ? ojoAbierto : ojoCerrado;
      btn.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
    });
  });

  // Alertas y estados de carga
  const alerta = (id, msg, tipo = "error") => {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = `form-alert ${tipo}`;
  };
  const limpiarAlertas = () => {
    document.querySelectorAll(".form-alert").forEach((el) => {
      el.className = "form-alert";
      el.textContent = "";
    });
  };
  const cargando = (id, activo, txtCarga, txtNormal) => {
    const btn = document.getElementById(id);
    btn.disabled = activo;
    btn.innerHTML = activo ? `<span class="spinner"></span>${txtCarga}` : txtNormal;
  };

  // ---------- Iniciar sesión ----------
  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarAlertas();

    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-pass").value;
    const recordar = document.getElementById("remember-me").checked;

    if (!email || !pass) return alerta("alert-login", "Completa el correo y la contraseña.");

    cargando("btn-login", true, "Verificando…", "Iniciar sesión");
    try {
      await setPersistence(auth, recordar ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, pass);
      // main.js detecta la sesión, muestra el splash y luego la app.
      cargando("btn-login", false, "", "Iniciar sesión");
      document.getElementById("form-login").reset();
      document.getElementById("remember-me").checked = recordar;
    } catch (err) {
      alerta("alert-login", errorAuth(err.code));
      cargando("btn-login", false, "", "Iniciar sesión");
    }
  });

  // ---------- Crear cuenta ----------
  document.getElementById("form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarAlertas();

    const nombre = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const pass = document.getElementById("reg-pass").value;
    const pass2 = document.getElementById("reg-pass2").value;

    if (!nombre || !email || !pass || !pass2) return alerta("alert-register", "Completa todos los campos.");
    if (nombre.length < 3) return alerta("alert-register", "Escribe tu nombre completo.");
    if (pass.length < 6) return alerta("alert-register", "La contraseña debe tener mínimo 6 caracteres.");
    if (pass !== pass2) return alerta("alert-register", "Las contraseñas no coinciden.");

    cargando("btn-register", true, "Creando cuenta…", "Crear cuenta");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: nombre });
      await setDoc(doc(db, "users", cred.user.uid), {
        nombre,
        email,
        fotoURL: null,
        creadoEn: serverTimestamp()
      });
      document.getElementById("form-register").reset();
      cargando("btn-register", false, "", "Crear cuenta");
      // main.js lleva al usuario directo a la app.
    } catch (err) {
      alerta("alert-register", errorAuth(err.code));
      cargando("btn-register", false, "", "Crear cuenta");
    }
  });

  // ---------- Recuperar contraseña ----------
  document.getElementById("form-reset").addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarAlertas();

    const email = document.getElementById("reset-email").value.trim();
    if (!email) return alerta("alert-reset", "Escribe tu correo electrónico.");

    cargando("btn-reset", true, "Enviando…", "Enviar enlace");
    try {
      await sendPasswordResetEmail(auth, email);
      alerta("alert-reset", "Listo. Revisa tu correo (incluida la carpeta de spam) y sigue el enlace para crear una nueva contraseña.", "success");
    } catch (err) {
      alerta("alert-reset", errorAuth(err.code));
    } finally {
      cargando("btn-reset", false, "", "Enviar enlace");
    }
  });

  // Volver siempre a la vista de login (la usa main.js al cerrar sesión)
  return { mostrarLogin: () => mostrarVista("login") };
}
