// ══════════════════════════════════════════════════════════
// BOE 2.0 — Router (navegación interna sin recargas)
// Rutas: #/dashboard · #/sesiones · #/sesiones/{id} · #/perfil
// ══════════════════════════════════════════════════════════

let rutas = {};
let contexto = {};
let activo = false;

export function iniciarRouter(rutasApp, ctx) {
  rutas = rutasApp;
  contexto = ctx;
  if (!activo) {
    window.addEventListener("hashchange", renderRuta);
    activo = true;
  }
  renderRuta();
}

export function actualizarContexto(ctx) {
  contexto = { ...contexto, ...ctx };
}

export function navegar(ruta) {
  if (window.location.hash === "#" + ruta) renderRuta();
  else window.location.hash = ruta;
}

async function renderRuta() {
  const hash = window.location.hash.replace(/^#/, "") || "/dashboard";
  const [, base, parametro] = hash.match(/^\/([^/]*)\/?(.*)$/) || [];
  const clave = "/" + (base || "dashboard");
  const modulo = rutas[clave] || rutas["/dashboard"];
  // "parametro" conserva todo lo que sigue a la base (incluidos los "/"),
  // p. ej. "c/abc/m/3/2026" para la navegación por meses.

  // Resaltar sección activa en el menú
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.ruta === clave);
  });

  // Cerrar menú móvil al navegar
  document.body.classList.remove("sidebar-open");

  const contenedor = document.getElementById("view");
  contenedor.innerHTML = "";

  try {
    await modulo.render(contenedor, { ...contexto, parametro: parametro || null });
    document.querySelector(".main-zone").scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error("Error al cargar el módulo:", err);
    contenedor.innerHTML = `
      <div class="view-error">
        <h3>No se pudo cargar esta sección</h3>
        <p>Revisa tu conexión e inténtalo de nuevo.</p>
      </div>`;
  }
}
