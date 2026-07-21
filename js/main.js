// ══════════════════════════════════════════════════════════
// BOE 2.0 — main.js (orquestador de la SPA)
//
// Controla qué pantalla existe en cada momento:
//   splash → mientras se valida la sesión
//   auth   → si no hay usuario
//   app    → si hay usuario autenticado
// Solo una pantalla es visible a la vez: nunca hay apilamiento.
//
// Para agregar un módulo futuro (reportes, configuración…):
//   1. Crear js/modules/nuevo.js con una función render().
//   2. Importarlo aquí y agregarlo al objeto "rutas".
//   3. Agregar su enlace en el menú lateral de index.html.
// ══════════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { iniciarAuth } from "./auth.js";
import { iniciarRouter, actualizarContexto } from "./router.js";
import { pintarUsuario, alternarTema, pintarIconoTema } from "./utils/ui.js";

import * as dashboard from "./modules/dashboard.js";
import * as sesiones from "./modules/sesiones.js";
import * as sesionDetalle from "./modules/sesion-detalle.js";
import * as perfil from "./modules/perfil.js";

// ---------- Rutas ----------
const rutas = {
  "/dashboard": dashboard,
  "/sesiones": {
    // /sesiones           → lista de carpetas        (módulo sesiones)
    // /sesiones/c/{id}    → contenido de la carpeta  (módulo sesiones)
    // /sesiones/{id}      → detalle de una sesión    (módulo sesion-detalle)
    render: (cont, ctx) => {
      const p = ctx.parametro;
      // Sin parámetro, o rutas de carpeta/mes (c/…) → módulo de carpetas.
      // Un ID suelto → detalle de la sesión.
      if (!p || p.startsWith("c/")) return sesiones.render(cont, ctx);
      return sesionDetalle.render(cont, ctx);
    }
  },
  "/perfil": perfil
};

// ---------- Control de pantallas ----------
const pantallas = {
  splash: document.getElementById("screen-splash"),
  auth: document.getElementById("screen-auth"),
  app: document.getElementById("screen-app")
};

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach((p) => p.classList.remove("visible"));
  pantallas[nombre].classList.add("visible");
}

// Splash inicial mientras Firebase valida la sesión guardada
mostrarPantalla("splash");
const splashDesde = Date.now();
const SPLASH_MINIMO = 900; // ms — que la animación se aprecie sin estorbar

// Inicializar los formularios de autenticación
const authUI = iniciarAuth();

// ---------- Ciclo de sesión ----------
let routerListo = false;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("splash-hint").textContent = "Preparando tu espacio de trabajo…";
    mostrarPantalla("splash");

    // Garantizar una duración mínima elegante del splash
    const restante = SPLASH_MINIMO - (Date.now() - splashDesde);
    if (restante > 0) await new Promise((r) => setTimeout(r, restante));

    pintarUsuario(user);
    actualizarContexto({ user });

    if (!routerListo) {
      iniciarRouter(rutas, { user });
      routerListo = true;
    } else if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = "/dashboard";
    }

    mostrarPantalla("app");
  } else {
    // Sin sesión: limpiar y mostrar solo el login
    window.location.hash = "";
    authUI.mostrarLogin();
    mostrarPantalla("auth");
  }
});

// ---------- Menú lateral ----------
// Móvil: abrir/cerrar deslizando
const toggleMovil = () => document.body.classList.toggle("sidebar-open");
document.getElementById("btn-menu").addEventListener("click", toggleMovil);
document.getElementById("sidebar-overlay").addEventListener("click", toggleMovil);

// Escritorio: colapsar a solo iconos (se recuerda la preferencia)
const btnCollapse = document.getElementById("btn-collapse");
if (localStorage.getItem("boe-sidebar") === "colapsado") {
  document.body.classList.add("sidebar-collapsed");
}
btnCollapse.addEventListener("click", () => {
  const colapsado = document.body.classList.toggle("sidebar-collapsed");
  localStorage.setItem("boe-sidebar", colapsado ? "colapsado" : "expandido");
});

// ---------- Tema claro / oscuro ----------
pintarIconoTema();
document.getElementById("btn-theme").addEventListener("click", alternarTema);

// ---------- Cerrar sesión ----------
document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  // onAuthStateChanged muestra el login automáticamente
});
