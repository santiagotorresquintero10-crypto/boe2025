// ══════════════════════════════════════════════════════════
// BOE 2.0 — Módulo: Dashboard
// ══════════════════════════════════════════════════════════

import { listarSesiones } from "../datos.js";
import { saludo, formatoFecha, esc } from "../utils/ui.js";
import { navegar } from "../router.js";

export async function render(contenedor, { user }) {
  const nombre = (user.displayName || "").split(" ")[0] || "usuario";

  contenedor.innerHTML = `
    <header class="view-head">
      <div>
        <h1>${saludo()}, ${esc(nombre)} 👋</h1>
        <p class="view-sub">Este es el resumen de tu actividad en BOE 2.0.</p>
      </div>
      <button class="btn btn-primary" id="dash-nueva">+ Nueva sesión</button>
    </header>

    <section class="stat-grid">
      <article class="stat-card"><span class="stat-label">Sesiones creadas</span><span class="stat-value skeleton sk-line" style="width:60px;height:34px" id="stat-total"></span></article>
      <article class="stat-card"><span class="stat-label">En proceso</span><span class="stat-value skeleton sk-line" style="width:60px;height:34px" id="stat-proceso"></span></article>
      <article class="stat-card"><span class="stat-label">Finalizadas</span><span class="stat-value skeleton sk-line" style="width:60px;height:34px" id="stat-final"></span></article>
    </section>

    <section class="panel-card">
      <h3>Sesiones recientes</h3>
      <div id="recientes">
        <div class="skeleton sk-card" style="margin-bottom:10px"></div>
        <div class="skeleton sk-card"></div>
      </div>
    </section>

    <section class="panel-card">
      <h3>¿Cómo funciona BOE 2.0?</h3>
      <ol class="steps-list">
        <li><strong>Crea una sesión</strong> desde el botón "Nueva sesión".</li>
        <li><strong>Diligencia la planilla</strong> — se guarda automáticamente mientras escribes.</li>
        <li><strong>Carga los 2 documentos</strong> de soporte (imagen o PDF).</li>
        <li><strong>Finaliza la sesión</strong> cuando todo esté completo.</li>
      </ol>
    </section>
  `;

  contenedor.querySelector("#dash-nueva").addEventListener("click", () => navegar("/sesiones"));

  // Datos reales
  try {
    const sesiones = await listarSesiones(user.uid);

    const pinta = (id, valor) => {
      const el = contenedor.querySelector("#" + id);
      if (!el) return;
      el.className = "stat-value";
      el.style.cssText = "";
      el.textContent = valor;
    };
    pinta("stat-total", sesiones.length);
    pinta("stat-proceso", sesiones.filter((s) => s.estado === "en_proceso").length);
    pinta("stat-final", sesiones.filter((s) => s.estado === "finalizada").length);

    const zona = contenedor.querySelector("#recientes");
    if (!zona) return;

    if (sesiones.length === 0) {
      zona.innerHTML = `<p class="view-sub">Aún no tienes sesiones. Crea la primera desde el botón "Nueva sesión".</p>`;
      return;
    }

    zona.innerHTML = sesiones.slice(0, 4).map((s) => `
      <div class="recent-item" data-id="${s.id}">
        <div class="recent-info">
          <strong>${esc(s.nombre)}</strong>
          <span>Actualizada: ${formatoFecha(s.actualizadaEn)}</span>
        </div>
        <span class="badge ${s.estado === "finalizada" ? "badge-finalizada" : "badge-proceso"}">
          ${s.estado === "finalizada" ? "Finalizada" : "En proceso"}
        </span>
      </div>
    `).join("");

    zona.querySelectorAll(".recent-item").forEach((item) => {
      item.addEventListener("click", () => navegar("/sesiones/" + item.dataset.id));
    });
  } catch (err) {
    console.error("Error cargando el dashboard:", err);
  }
}
