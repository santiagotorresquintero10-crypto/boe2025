// ══════════════════════════════════════════════════════════
// BOE 2.0 — Módulo: Carpetas → Meses → Sesiones
//   #/sesiones            → lista de carpetas
//   #/sesiones/c/{id}     → meses de una carpeta
//   #/sesiones/c/{id}/m/{0-11}[/{anio}] → sesiones del mes
//   #/sesiones/{id}       → detalle de sesión (otro módulo)
// ══════════════════════════════════════════════════════════

import {
  listarSesiones, crearSesion, eliminarSesion, pacientesCompletos, TIPOS_SESION, MESES,
  listarCarpetas, crearCarpeta, actualizarCarpeta, eliminarCarpetaDoc,
  asegurarCarpetaGeneral, moverSesionACarpeta, subirLogoCarpeta, eliminarArchivo,
  copiarEstructuraSesion, moverSesionAMes
} from "../datos.js";
import { toast, abrirModal, confirmar, formatoFecha, esc, comprimirImagen } from "../utils/ui.js";
import { navegar } from "../router.js";
import {
  construirPlantillaDesdeCarpeta, guardarEnBiblioteca, listarBiblioteca,
  eliminarDeBiblioteca, descargarPlantilla, leerPlantillaDesdeArchivo, importarPlantilla
} from "../plantillas.js";

const COLORES_CARPETA = ["", "#e8a23d", "#2e8b6e", "#4a7fb5", "#9a6bb5", "#c2492e", "#3aa6a6", "#b58b4a"];
const ANIO_ACTUAL = new Date().getFullYear();

const ICONO_CARPETA = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
  </svg>`;

const logoHTML = (carpeta) =>
  carpeta?.logoURL ? `<img src="${carpeta.logoURL}" alt="" loading="lazy" />` : ICONO_CARPETA;

const mesDe = (s) => (Number.isInteger(s.mes) ? s.mes : new Date((s.creadaEn?.seconds || 0) * 1000).getMonth());
const anioDe = (s) => s.anio || (s.creadaEn?.seconds ? new Date(s.creadaEn.seconds * 1000).getFullYear() : ANIO_ACTUAL);

export async function render(contenedor, ctx) {
  const p = ctx.parametro || "";
  // c/{id}/m/{mes}/{anio}
  const m = p.match(/^c\/([^/]+)\/m\/(\d+)(?:\/(\d+))?$/);
  if (m) {
    await renderMes(contenedor, ctx, m[1], Number(m[2]), Number(m[3]) || ANIO_ACTUAL);
  } else if (p.startsWith("c/")) {
    await renderMeses(contenedor, ctx, p.slice(2));
  } else {
    await renderCarpetas(contenedor, ctx);
  }
}

// ══════════════════ NIVEL 1: CARPETAS ══════════════════

async function renderCarpetas(contenedor, ctx) {
  contenedor.innerHTML = `
    <header class="view-head">
      <div>
        <h1>Sesiones</h1>
        <p class="view-sub">Organiza tus sesiones en carpetas, y dentro de cada una, por meses del año.</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="btn-biblioteca">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
          Biblioteca
        </button>
        <button class="btn btn-secondary" id="btn-importar-plantilla">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/></svg>
          Importar Plantilla
        </button>
        <button class="btn btn-primary" id="btn-nueva-carpeta">+ Nueva carpeta</button>
      </div>
    </header>
    <div id="zona-carpetas">
      <div class="carpeta-grid">
        <div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div>
      </div>
    </div>`;

  contenedor.querySelector("#btn-nueva-carpeta").addEventListener("click", () =>
    modalCarpeta(null, () => renderCarpetas(contenedor, ctx), ctx));
  contenedor.querySelector("#btn-importar-plantilla").addEventListener("click", () =>
    modalImportarPlantilla(ctx, () => renderCarpetas(contenedor, ctx)));
  contenedor.querySelector("#btn-biblioteca").addEventListener("click", () =>
    modalBiblioteca(ctx, () => renderCarpetas(contenedor, ctx)));

  const zona = contenedor.querySelector("#zona-carpetas");

  let carpetas, sesiones;
  try {
    [carpetas, sesiones] = await Promise.all([listarCarpetas(ctx.user.uid), listarSesiones(ctx.user.uid)]);
    const huerfanas = sesiones.filter((s) => !s.carpetaId);
    if (huerfanas.length) {
      const general = await asegurarCarpetaGeneral(ctx.user.uid, carpetas);
      for (const s of huerfanas) { await moverSesionACarpeta(s.id, general.id); s.carpetaId = general.id; }
      carpetas = await listarCarpetas(ctx.user.uid);
    }
  } catch (err) {
    console.error("Error cargando carpetas:", err);
    zona.innerHTML = `<div class="view-error"><h3>No se pudieron cargar tus carpetas</h3><p>Revisa tu conexión e inténtalo de nuevo.</p></div>`;
    return;
  }

  if (carpetas.length === 0) {
    zona.innerHTML = `
      <section class="empty-state">
        <div class="empty-icon">${ICONO_CARPETA}</div>
        <h3>Aún no tienes carpetas</h3>
        <p>Crea tu primera carpeta (por ejemplo "Cirugías 2026") y dentro organiza las sesiones por mes.</p>
        <button class="btn btn-primary" id="btn-primera-carpeta">+ Crear mi primera carpeta</button>
      </section>`;
    zona.querySelector("#btn-primera-carpeta").addEventListener("click", () =>
      modalCarpeta(null, () => renderCarpetas(contenedor, ctx), ctx));
    return;
  }

  const conteo = (id) => sesiones.filter((s) => s.carpetaId === id).length;

  zona.innerHTML = `
    <div class="carpeta-grid">
      ${carpetas.map((c) => `
        <article class="carpeta-card" data-id="${c.id}" ${c.color ? `style="--carpeta-color:${c.color}"` : ""}>
          <div class="carpeta-top">
            <div class="carpeta-icono">${logoHTML(c)}</div>
            <div class="carpeta-acciones">
              <button class="btn-icon car-plantilla" title="Exportar como plantilla">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
              </button>
              <button class="btn-icon car-editar" title="Editar carpeta">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
              </button>
              ${c.general ? "" : `
              <button class="btn-icon car-eliminar" title="Eliminar carpeta" style="color:var(--danger)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>`}
            </div>
          </div>
          <h3>${esc(c.nombre)}</h3>
          <p class="carpeta-desc">${esc(c.descripcion) || "<em style='color:var(--line-strong)'>Sin descripción</em>"}</p>
          <div class="carpeta-pie">
            <span>${conteo(c.id)} sesión${conteo(c.id) === 1 ? "" : "es"}</span>
            <span class="carpeta-abrir">Abrir →</span>
          </div>
        </article>`).join("")}
    </div>`;

  zona.querySelectorAll(".carpeta-card").forEach((card) => {
    const carpeta = carpetas.find((c) => c.id === card.dataset.id);
    card.addEventListener("click", () => navegar("/sesiones/c/" + carpeta.id));
    card.querySelector(".car-editar").addEventListener("click", (e) => {
      e.stopPropagation(); modalCarpeta(carpeta, () => renderCarpetas(contenedor, ctx), ctx);
    });
    card.querySelector(".car-plantilla").addEventListener("click", (e) => {
      e.stopPropagation(); modalExportarPlantilla(ctx, carpeta);
    });
    card.querySelector(".car-eliminar")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const n = conteo(carpeta.id);
      const ok = await confirmar("Eliminar carpeta",
        n > 0 ? `"${carpeta.nombre}" contiene ${n} sesión(es). Se moverán a General y luego se eliminará la carpeta.`
              : `Se eliminará la carpeta "${carpeta.nombre}".`,
        { textoOk: "Eliminar", peligro: true });
      if (!ok) return;
      try {
        if (n > 0) {
          const general = await asegurarCarpetaGeneral(ctx.user.uid);
          for (const s of sesiones.filter((x) => x.carpetaId === carpeta.id)) await moverSesionACarpeta(s.id, general.id);
        }
        if (carpeta.logoPath) await eliminarArchivo(carpeta.logoPath);
        await eliminarCarpetaDoc(carpeta.id);
        toast("Carpeta eliminada", "success");
        renderCarpetas(contenedor, ctx);
      } catch (err) { console.error(err); toast("No se pudo eliminar la carpeta", "error"); }
    });
  });
}

// ══════════════════ NIVEL 2: MESES DE UNA CARPETA ══════════════════

async function renderMeses(contenedor, ctx, carpetaId) {
  contenedor.innerHTML = `<div class="skeleton sk-line" style="width:220px"></div><div class="skeleton sk-card" style="margin-top:16px"></div>`;

  let carpetas, sesiones;
  try {
    [carpetas, sesiones] = await Promise.all([listarCarpetas(ctx.user.uid), listarSesiones(ctx.user.uid)]);
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `<div class="view-error"><h3>No se pudo cargar la carpeta</h3><p>Revisa tu conexión.</p></div>`;
    return;
  }

  const carpeta = carpetas.find((c) => c.id === carpetaId);
  if (!carpeta) {
    contenedor.innerHTML = `<div class="view-error"><h3>Carpeta no encontrada</h3><p>Es posible que haya sido eliminada.</p></div>`;
    return;
  }

  const propias = sesiones.filter((s) => s.carpetaId === carpetaId);
  // Año a mostrar: el más reciente con sesiones, o el actual
  const anios = [...new Set(propias.map(anioDe))].sort((a, b) => b - a);
  const anioVista = anios[0] || ANIO_ACTUAL;

  const cuenta = (mesIdx) => propias.filter((s) => mesDe(s) === mesIdx && anioDe(s) === anioVista).length;

  contenedor.innerHTML = `
    <a class="view-back" href="#/sesiones">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Todas las carpetas
    </a>
    <header class="view-head">
      <div class="carpeta-header">
        <div class="carpeta-icono grande" ${carpeta.color ? `style="--carpeta-color:${carpeta.color}"` : ""}>${logoHTML(carpeta)}</div>
        <div>
          <h1>${esc(carpeta.nombre)}</h1>
          <p class="view-sub">Selecciona un mes para ver o crear sus sesiones · ${anioVista}</p>
        </div>
      </div>
    </header>
    <div class="mes-grid">
      ${MESES.map((nombre, i) => {
        const n = cuenta(i);
        const esActual = i === new Date().getMonth() && anioVista === ANIO_ACTUAL;
        return `
          <button class="mes-card ${n ? "con-sesiones" : ""} ${esActual ? "actual" : ""}" data-mes="${i}">
            <div class="mes-cal">
              <span class="mes-cal-top"></span>
              <span class="mes-cal-num">${i + 1}</span>
            </div>
            <span class="mes-nombre">${nombre}</span>
            <span class="mes-conteo">${n ? `${n} sesión${n === 1 ? "" : "es"}` : "Vacío"}</span>
          </button>`;
      }).join("")}
    </div>`;

  contenedor.querySelectorAll(".mes-card").forEach((card) => {
    card.addEventListener("click", () => navegar(`/sesiones/c/${carpetaId}/m/${card.dataset.mes}/${anioVista}`));
  });
}

// ══════════════════ NIVEL 3: SESIONES DE UN MES ══════════════════

async function renderMes(contenedor, ctx, carpetaId, mes, anio) {
  contenedor.innerHTML = `<div class="skeleton sk-line" style="width:220px"></div><div class="skeleton sk-card" style="margin-top:16px"></div>`;

  let carpetas, sesiones;
  try {
    [carpetas, sesiones] = await Promise.all([listarCarpetas(ctx.user.uid), listarSesiones(ctx.user.uid)]);
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `<div class="view-error"><h3>No se pudo cargar el mes</h3><p>Revisa tu conexión.</p></div>`;
    return;
  }

  const carpeta = carpetas.find((c) => c.id === carpetaId);
  if (!carpeta) { contenedor.innerHTML = `<div class="view-error"><h3>Carpeta no encontrada</h3></div>`; return; }

  const propias = sesiones.filter((s) => s.carpetaId === carpetaId && mesDe(s) === mes && anioDe(s) === anio);
  const recargar = () => renderMes(contenedor, ctx, carpetaId, mes, anio);

  contenedor.innerHTML = `
    <a class="view-back" href="#/sesiones/c/${carpetaId}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      ${esc(carpeta.nombre)}
    </a>
    <header class="view-head">
      <div>
        <h1>${MESES[mes]} <span style="color:var(--ink-soft);font-weight:600">${anio}</span></h1>
        <p class="view-sub">${esc(carpeta.nombre)} · ${propias.length} sesión(es)</p>
      </div>
      <button class="btn btn-primary" id="btn-nueva">+ Nueva sesión</button>
    </header>
    <div id="zona-lista"></div>`;

  contenedor.querySelector("#btn-nueva").addEventListener("click", () =>
    modalNuevaSesion(ctx, carpetaId, mes, anio));

  const zona = contenedor.querySelector("#zona-lista");

  if (propias.length === 0) {
    zona.innerHTML = `
      <section class="empty-state">
        <div class="empty-icon">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>
        </div>
        <h3>No hay sesiones en ${MESES[mes]}</h3>
        <p>Crea una sesión nueva o copia la estructura de una sesión de otro mes.</p>
        <button class="btn btn-primary" id="btn-primera">+ Crear la primera sesión</button>
      </section>`;
    zona.querySelector("#btn-primera").addEventListener("click", () => modalNuevaSesion(ctx, carpetaId, mes, anio));
    return;
  }

  zona.innerHTML = `<div class="session-grid">${propias.map(tarjetaSesion).join("")}</div>`;

  zona.querySelectorAll(".session-card").forEach((card) => {
    const sesion = propias.find((s) => s.id === card.dataset.id);
    card.addEventListener("click", () => navegar("/sesiones/" + sesion.id));

    card.querySelector(".btn-copiar").addEventListener("click", (e) => {
      e.stopPropagation(); modalCopiar(ctx, sesion, carpetas, recargar);
    });
    card.querySelector(".btn-mover").addEventListener("click", (e) => {
      e.stopPropagation(); modalMover(sesion, carpetas, carpetaId, recargar);
    });
    card.querySelector(".btn-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmar("Eliminar sesión",
        `Se eliminará "${sesion.nombre}" junto con su planilla y todos sus documentos. Esta acción no se puede deshacer.`,
        { textoOk: "Eliminar", peligro: true });
      if (!ok) return;
      try { await eliminarSesion(sesion); toast("Sesión eliminada", "success"); recargar(); }
      catch (err) { console.error(err); toast("No se pudo eliminar la sesión", "error"); }
    });
  });
}

function tarjetaSesion(s) {
  const esCirugia = (s.tipo || "cirugia") === "cirugia";
  const { total, completos } = pacientesCompletos(s);
  const chipDocs = esCirugia
    ? `<span class="docs-chip ${completos === total && total > 0 ? "ok" : ""}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        ${completos}/${total} pacientes</span>`
    : `<span class="docs-chip">${total} paciente${total === 1 ? "" : "s"}</span>`;
  return `
    <article class="session-card" data-id="${s.id}">
      <div class="session-card-top">
        <h3>${esc(s.nombre)}</h3>
        <span class="badge ${s.estado === "finalizada" ? "badge-finalizada" : "badge-proceso"}">${s.estado === "finalizada" ? "Finalizada" : "En proceso"}</span>
      </div>
      <div><span class="tipo-chip ${esCirugia ? "cirugia" : "consulta"}">${esCirugia ? "Cirugía" : "Consulta"}</span></div>
      <p class="session-desc">${esc(s.descripcion) || "<em style='color:var(--line-strong)'>Sin descripción</em>"}</p>
      <div class="session-meta">
        <span>${formatoFecha(s.actualizadaEn)}</span>
        ${chipDocs}
        <span style="display:flex;gap:2px">
          <button class="btn-icon row-del btn-copiar" title="Copiar estructura a otro mes" style="color:var(--ink-soft)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="btn-icon row-del btn-mover" title="Mover a otra carpeta" style="color:var(--ink-soft)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3 3 3-3"/></svg>
          </button>
          <button class="btn-icon row-del btn-del" title="Eliminar sesión">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </span>
      </div>
    </article>`;
}

// ══════════════════ MODAL: COPIAR A OTRO MES (plantilla) ══════════════════

function modalCopiar(ctx, sesion, carpetas, alTerminar) {
  const carpetaActual = sesion.carpetaId;
  const { cerrar, el } = abrirModal(`
    <h3>Copiar sesión a otro mes</h3>
    <p class="modal-text">Se creará una sesión <strong>vacía</strong> con la misma estructura de "${esc(sesion.nombre)}" (tipo y columnas). <strong>No se copian</strong> pacientes, documentos ni datos.</p>
    <form id="form-copiar" novalidate>
      <div class="field">
        <label for="cp-nombre">Nombre de la nueva sesión</label>
        <input type="text" id="cp-nombre" maxlength="80" required value="${esc(sesion.nombre)}" />
      </div>
      <div class="dos-col">
        <div class="field">
          <label for="cp-carpeta">Carpeta</label>
          <select id="cp-carpeta">
            ${carpetas.map((c) => `<option value="${c.id}" ${c.id === carpetaActual ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="cp-mes">Mes de destino</label>
          <select id="cp-mes">
            ${MESES.map((nombre, i) => `<option value="${i}" ${i === (mesActual(sesion) + 1) % 12 ? "selected" : ""}>${nombre}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="cp-anio">Año</label>
        <input type="number" id="cp-anio" value="${anioDe(sesion)}" min="2020" max="2100" style="max-width:130px" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cp-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="cp-crear">Crear copia vacía</button>
      </div>
    </form>
  `);

  el.querySelector("#cp-cancelar").addEventListener("click", cerrar);
  el.querySelector("#cp-nombre").select();

  el.querySelector("#form-copiar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = el.querySelector("#cp-nombre").value.trim();
    if (!nombre) return toast("Escribe un nombre para la nueva sesión.", "error");
    const carpetaId = el.querySelector("#cp-carpeta").value;
    const mes = Number(el.querySelector("#cp-mes").value);
    const anio = Number(el.querySelector("#cp-anio").value) || ANIO_ACTUAL;

    const btn = el.querySelector("#cp-crear");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Copiando…`;
    try {
      const id = await copiarEstructuraSesion(ctx.user.uid, sesion, { nombre, mes, anio, carpetaId });
      cerrar();
      toast(`Estructura copiada a ${MESES[mes]} ${anio}`, "success");
      navegar("/sesiones/" + id);
    } catch (err) {
      console.error(err);
      toast("No se pudo copiar la sesión", "error");
      btn.disabled = false;
      btn.textContent = "Crear copia vacía";
    }
  });
}

function mesActual(s) { return Number.isInteger(s.mes) ? s.mes : new Date().getMonth(); }

// ══════════════════ MODAL: MOVER A OTRA CARPETA ══════════════════

function modalMover(sesion, carpetas, carpetaActualId, alTerminar) {
  const destinos = carpetas.filter((c) => c.id !== carpetaActualId);
  if (!destinos.length) return toast("No hay otras carpetas. Crea una primero.", "info");
  const { cerrar, el } = abrirModal(`
    <h3>Mover sesión</h3>
    <p class="modal-text">Elige la carpeta de destino para "${esc(sesion.nombre)}". Conservará su mes (${MESES[mesActual(sesion)]}).</p>
    <div class="mover-lista">
      ${destinos.map((c) => `
        <button class="mover-item" data-id="${c.id}" ${c.color ? `style="--carpeta-color:${c.color}"` : ""}>
          <span class="carpeta-icono mini">${logoHTML(c)}</span><span>${esc(c.nombre)}</span>
        </button>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" id="mv-cancelar">Cancelar</button></div>`);
  el.querySelector("#mv-cancelar").addEventListener("click", cerrar);
  el.querySelectorAll(".mover-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try { await moverSesionACarpeta(sesion.id, btn.dataset.id); cerrar(); toast("Sesión movida", "success"); alTerminar(); }
      catch (err) { console.error(err); toast("No se pudo mover la sesión", "error"); }
    });
  });
}

// ══════════════════ MODAL: CREAR / EDITAR CARPETA ══════════════════

function modalCarpeta(carpeta, alTerminar, ctx) {
  const editando = !!carpeta;
  let color = carpeta?.color || "";
  let archivoNuevo = null, quitarLogo = false;
  let previewURL = carpeta?.logoURL || null;

  const { cerrar, el } = abrirModal(`
    <h3>${editando ? "Editar carpeta" : "Nueva carpeta"}</h3>
    <form id="form-carpeta" novalidate>
      <div class="field">
        <label for="ca-nombre">Nombre</label>
        <input type="text" id="ca-nombre" maxlength="50" required value="${esc(carpeta?.nombre || "")}" placeholder="Ej: Cirugías 2026" ${carpeta?.general ? "disabled" : ""} />
        ${carpeta?.general ? `<p class="field-hint">La carpeta General no se puede renombrar.</p>` : ""}
      </div>
      <div class="field">
        <label>Logo de la carpeta <span style="font-weight:400;color:var(--ink-soft)">(opcional)</span></label>
        <div class="logo-uploader">
          <div class="logo-preview" id="logo-preview"></div>
          <div class="logo-uploader-info">
            <p class="field-hint" style="margin:0 0 10px">Imagen PNG, JPG o WEBP. Se optimiza automáticamente. Si no eliges una, se usa el ícono del sistema.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-elegir-logo">Seleccionar imagen</button>
              <button type="button" class="btn btn-ghost-danger btn-sm" id="btn-quitar-logo" hidden>Quitar imagen</button>
            </div>
            <p class="field-hint" id="logo-estado" style="margin-top:8px"></p>
          </div>
        </div>
        <input type="file" id="ca-logo" hidden accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" />
      </div>
      <div class="field">
        <label>Color de identificación <span style="font-weight:400;color:var(--ink-soft)">(opcional)</span></label>
        <div class="color-swatches">
          ${COLORES_CARPETA.map((c) => `<button type="button" class="color-swatch ${c === color ? "selected" : ""}" data-color="${c}" style="${c ? `background:${c}` : ""}" title="${c || "Sin color"}">${c ? "" : "∅"}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="ca-desc">Descripción <span style="font-weight:400;color:var(--ink-soft)">(opcional)</span></label>
        <textarea id="ca-desc" maxlength="180" placeholder="¿Qué guardarás en esta carpeta?">${esc(carpeta?.descripcion || "")}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="ca-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="ca-guardar">${editando ? "Guardar cambios" : "Crear carpeta"}</button>
      </div>
    </form>
  `);

  const preview = el.querySelector("#logo-preview");
  const btnQuitar = el.querySelector("#btn-quitar-logo");
  const pintarPreview = () => {
    preview.innerHTML = previewURL ? `<img src="${previewURL}" alt="Vista previa del logo" />` : ICONO_CARPETA;
    btnQuitar.hidden = !previewURL;
  };
  pintarPreview();

  const inputLogo = el.querySelector("#ca-logo");
  const estadoLogo = el.querySelector("#logo-estado");
  el.querySelector("#btn-elegir-logo").addEventListener("click", () => inputLogo.click());

  inputLogo.addEventListener("change", async () => {
    const file = inputLogo.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast("El logo debe ser PNG, JPG o WEBP.", "error");
    if (file.size > 8 * 1024 * 1024) return toast("La imagen no puede superar 8 MB.", "error");
    try {
      estadoLogo.textContent = "Optimizando imagen…";
      archivoNuevo = await comprimirImagen(file, 400); // 400px: nitidez para el contenedor ampliado
      quitarLogo = false;
      if (previewURL?.startsWith("blob:")) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(archivoNuevo);
      pintarPreview();
      estadoLogo.textContent = "✓ Imagen lista (se guardará al confirmar)";
    } catch (err) { console.error(err); estadoLogo.textContent = ""; toast("No se pudo procesar la imagen.", "error"); }
  });

  btnQuitar.addEventListener("click", () => {
    archivoNuevo = null; quitarLogo = true;
    if (previewURL?.startsWith("blob:")) URL.revokeObjectURL(previewURL);
    previewURL = null; inputLogo.value = ""; estadoLogo.textContent = ""; pintarPreview();
  });

  el.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".color-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected"); color = btn.dataset.color;
    });
  });

  el.querySelector("#ca-nombre").focus();
  el.querySelector("#ca-cancelar").addEventListener("click", cerrar);

  el.querySelector("#form-carpeta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = carpeta?.general ? carpeta.nombre : el.querySelector("#ca-nombre").value.trim();
    const descripcion = el.querySelector("#ca-desc").value.trim();
    if (!nombre) return toast("Escribe un nombre para la carpeta.", "error");

    const btn = el.querySelector("#ca-guardar");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Guardando…`;
    try {
      let logoURL = carpeta?.logoURL || null, logoPath = carpeta?.logoPath || null;
      if (archivoNuevo) {
        const subido = await subirLogoCarpeta(ctx.user.uid, archivoNuevo, (pct) => { btn.innerHTML = `<span class="spinner"></span>Subiendo logo… ${pct}%`; });
        if (logoPath) await eliminarArchivo(logoPath);
        logoURL = subido.url; logoPath = subido.path;
      } else if (quitarLogo && logoPath) {
        await eliminarArchivo(logoPath); logoURL = null; logoPath = null;
      }
      if (editando) { await actualizarCarpeta(carpeta.id, { nombre, color, descripcion, logoURL, logoPath }); toast("Carpeta actualizada", "success"); }
      else { await crearCarpeta(ctx.user.uid, { nombre, color, descripcion, logoURL, logoPath }); toast("Carpeta creada", "success"); }
      if (previewURL?.startsWith("blob:")) URL.revokeObjectURL(previewURL);
      cerrar(); alTerminar();
    } catch (err) {
      console.error(err); toast("No se pudo guardar la carpeta", "error");
      btn.disabled = false; btn.textContent = editando ? "Guardar cambios" : "Crear carpeta";
    }
  });
}

// ══════════════════ MODAL: NUEVA SESIÓN ══════════════════

function modalNuevaSesion(ctx, carpetaId, mes, anio) {
  const { cerrar, el } = abrirModal(`
    <h3>Nueva sesión</h3>
    <p class="modal-text">Se creará en <strong>${MESES[mes]} ${anio}</strong>. Elige el tipo y un nombre.</p>
    <form id="form-nueva" novalidate>
      <div class="tipo-grid">
        ${Object.entries(TIPOS_SESION).map(([id, t]) => `
          <button type="button" class="tipo-card ${id === "cirugia" ? "selected" : ""}" data-tipo="${id}">
            <span class="tipo-icono">
              ${id === "cirugia"
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m18 2-8.5 8.5"/><path d="m9 11-6.5 6.5a2.12 2.12 0 1 0 3 3L12 14"/><path d="m16 16 3.5 3.5"/><circle cx="19" cy="5" r="2.5"/></svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`}
            </span>
            <span class="tipo-nombre">${t.titulo}</span>
            <span class="tipo-desc">${t.descripcion}</span>
          </button>`).join("")}
      </div>
      <div class="field">
        <label for="ns-nombre">Nombre de la sesión</label>
        <input type="text" id="ns-nombre" maxlength="80" required placeholder="Ej: Programación quirúrgica · semana 1" />
      </div>
      <div class="field">
        <label for="ns-desc">Descripción <span style="font-weight:400;color:var(--ink-soft)">(opcional)</span></label>
        <textarea id="ns-desc" maxlength="220" placeholder="Breve descripción de esta sesión…"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="ns-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="ns-crear">Crear sesión</button>
      </div>
    </form>
  `, { grande: true });

  let tipoSeleccionado = "cirugia";
  el.querySelectorAll(".tipo-card").forEach((card) => {
    card.addEventListener("click", () => {
      el.querySelectorAll(".tipo-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected"); tipoSeleccionado = card.dataset.tipo;
    });
  });

  el.querySelector("#ns-nombre").focus();
  el.querySelector("#ns-cancelar").addEventListener("click", cerrar);

  el.querySelector("#form-nueva").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = el.querySelector("#ns-nombre").value.trim();
    const descripcion = el.querySelector("#ns-desc").value.trim();
    if (!nombre) return toast("Escribe un nombre para la sesión", "error");

    const btn = el.querySelector("#ns-crear");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Creando…`;
    try {
      const id = await crearSesion(ctx.user.uid, { nombre, descripcion, tipo: tipoSeleccionado, carpetaId, mes, anio });
      cerrar(); toast("Sesión creada", "success"); navegar("/sesiones/" + id);
    } catch (err) {
      console.error(err); toast("No se pudo crear la sesión", "error");
      btn.disabled = false; btn.textContent = "Crear sesión";
    }
  });
}

// ══════════════════════════════════════════════════════════
// PLANTILLAS — modales
// ══════════════════════════════════════════════════════════

// ---------- Exportar una carpeta como plantilla ----------
function modalExportarPlantilla(ctx, carpeta) {
  const { cerrar, el } = abrirModal(`
    <h3>📄 Exportar como Plantilla</h3>
    <p class="modal-text">Se copiará <strong>solo la estructura</strong> de "${esc(carpeta.nombre)}": meses, sesiones, columnas y su configuración. <strong>No</strong> se incluyen pacientes, documentos ni datos.</p>
    <div class="field">
      <label for="pl-nombre">Nombre de la plantilla</label>
      <input type="text" id="pl-nombre" maxlength="60" value="${esc(carpeta.nombre)}" />
    </div>
    <div id="pl-resumen" class="plantilla-resumen"><span class="spinner spinner-dark" style="width:14px;height:14px"></span> Analizando estructura…</div>
    <div class="modal-actions" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
      <button class="btn btn-secondary" id="pl-cancelar">Cancelar</button>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="pl-descargar" disabled>⬇ Descargar archivo</button>
        <button class="btn btn-primary" id="pl-guardar" disabled>Guardar en Biblioteca</button>
      </div>
    </div>
  `, { grande: true });

  el.querySelector("#pl-cancelar").addEventListener("click", cerrar);

  let plantilla = null;
  (async () => {
    try {
      plantilla = await construirPlantillaDesdeCarpeta(ctx.user.uid, carpeta);
      const totalCols = plantilla.sesiones.reduce((n, s) => n + s.columnas.length, 0);
      const meses = [...new Set(plantilla.sesiones.map((s) => s.mes))].length;
      el.querySelector("#pl-resumen").innerHTML = `
        <div class="resumen-linea"><strong>${plantilla.sesiones.length}</strong> sesión(es)</div>
        <div class="resumen-linea"><strong>${meses}</strong> mes(es) con contenido</div>
        <div class="resumen-linea"><strong>${totalCols}</strong> columna(s) en total</div>
        <div class="resumen-linea" style="color:var(--success)">✓ Sin pacientes ni documentos</div>`;
      el.querySelector("#pl-descargar").disabled = false;
      el.querySelector("#pl-guardar").disabled = false;
    } catch (err) {
      console.error(err);
      el.querySelector("#pl-resumen").innerHTML = `<span style="color:var(--danger)">No se pudo analizar la carpeta.</span>`;
    }
  })();

  el.querySelector("#pl-descargar").addEventListener("click", () => {
    if (!plantilla) return;
    const nombre = el.querySelector("#pl-nombre").value.trim() || carpeta.nombre;
    descargarPlantilla({ ...plantilla, carpeta: { ...plantilla.carpeta, nombre } });
    toast("Plantilla descargada — compártela con quien quieras", "success");
  });

  el.querySelector("#pl-guardar").addEventListener("click", async () => {
    if (!plantilla) return;
    const nombre = el.querySelector("#pl-nombre").value.trim() || carpeta.nombre;
    const btn = el.querySelector("#pl-guardar");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>Guardando…`;
    try {
      await guardarEnBiblioteca(ctx.user.uid, { ...plantilla, carpeta: { ...plantilla.carpeta, nombre } }, nombre);
      cerrar();
      toast("Plantilla guardada en tu Biblioteca", "success");
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar la plantilla", "error");
      btn.disabled = false; btn.textContent = "Guardar en Biblioteca";
    }
  });
}

// ---------- Importar plantilla (desde archivo) ----------
function modalImportarPlantilla(ctx, alTerminar) {
  const { cerrar, el } = abrirModal(`
    <h3>📥 Importar Plantilla</h3>
    <p class="modal-text">Selecciona un archivo de plantilla (<strong>.boe.json</strong>) que te hayan compartido o que hayas exportado. Se creará la estructura completa en tu espacio, <strong>vacía</strong> y con identificadores nuevos.</p>
    <div class="import-drop" id="import-drop">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/></svg>
      <p>Arrastra el archivo aquí o</p>
      <button class="btn btn-secondary btn-sm" id="btn-elegir-archivo">Seleccionar archivo</button>
      <input type="file" id="import-file" hidden accept=".json,application/json" />
    </div>
    <div id="import-preview"></div>
    <div class="modal-actions"><button class="btn btn-secondary" id="im-cancelar">Cancelar</button></div>
  `, { grande: true });

  el.querySelector("#im-cancelar").addEventListener("click", cerrar);
  const inputFile = el.querySelector("#import-file");
  const drop = el.querySelector("#import-drop");
  el.querySelector("#btn-elegir-archivo").addEventListener("click", () => inputFile.click());

  const procesar = async (file) => {
    if (!file) return;
    try {
      const plantilla = await leerPlantillaDesdeArchivo(file);
      mostrarPreview(plantilla);
    } catch (err) {
      toast(err.message || "Archivo no válido", "error");
    }
  };

  inputFile.addEventListener("change", () => procesar(inputFile.files[0]));
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", (e) => procesar(e.dataTransfer.files[0]));

  function mostrarPreview(plantilla) {
    const totalCols = plantilla.sesiones.reduce((n, s) => n + s.columnas.length, 0);
    el.querySelector("#import-preview").innerHTML = `
      <div class="import-resumen">
        <div class="import-resumen-head">
          <div class="carpeta-icono mini">${plantilla.carpeta.logoURL ? `<img src="${plantilla.carpeta.logoURL}" alt="">` : "📁"}</div>
          <div>
            <strong>${esc(plantilla.carpeta.nombre)}</strong>
            <span style="display:block;font-size:12.5px;color:var(--ink-soft)">${plantilla.sesiones.length} sesión(es) · ${totalCols} columna(s)</span>
          </div>
        </div>
        <p class="field-hint" style="margin:12px 0">Se creará esta estructura vacía en tu espacio de trabajo.</p>
        <button class="btn btn-primary btn-block" id="im-confirmar">Importar a mi espacio</button>
        <p class="import-progreso" id="im-progreso"></p>
      </div>`;

    el.querySelector("#im-confirmar").addEventListener("click", async () => {
      const btn = el.querySelector("#im-confirmar");
      const prog = el.querySelector("#im-progreso");
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>Importando…`;
      try {
        const res = await importarPlantilla(ctx.user.uid, plantilla, (txt) => (prog.textContent = txt));
        cerrar();
        toast(`Plantilla importada: ${res.totalSesiones} sesión(es) creadas`, "success");
        alTerminar();
      } catch (err) {
        console.error(err);
        toast("No se pudo importar la plantilla", "error");
        btn.disabled = false; btn.textContent = "Importar a mi espacio";
      }
    });
  }
}

// ---------- Biblioteca de Plantillas ----------
function modalBiblioteca(ctx, alTerminar) {
  const { cerrar, el } = abrirModal(`
    <h3>Biblioteca de Plantillas</h3>
    <p class="modal-text">Tus estructuras reutilizables. Impórtalas a tu espacio cuando las necesites o descárgalas para compartirlas.</p>
    <div id="biblioteca-lista"><div class="skeleton sk-card"></div></div>
    <div class="modal-actions"><button class="btn btn-secondary" id="bib-cerrar">Cerrar</button></div>
  `, { grande: true });

  el.querySelector("#bib-cerrar").addEventListener("click", cerrar);
  const lista = el.querySelector("#biblioteca-lista");

  const cargar = async () => {
    let items;
    try { items = await listarBiblioteca(ctx.user.uid); }
    catch (err) { console.error(err); lista.innerHTML = `<p class="view-sub">No se pudo cargar la biblioteca.</p>`; return; }

    if (!items.length) {
      lista.innerHTML = `<div class="empty-state" style="padding:30px 20px">
        <p class="view-sub">Aún no tienes plantillas guardadas.<br>Usa "Exportar como Plantilla" en el menú de una carpeta.</p>
      </div>`;
      return;
    }

    lista.innerHTML = items.map((it) => `
      <div class="biblioteca-item" data-id="${it.id}">
        <div class="biblioteca-info">
          <strong>${esc(it.nombre)}</strong>
          <span>${it.totalSesiones || 0} sesión(es) · guardada ${formatoFecha(it.creadaEn)}</span>
        </div>
        <div class="biblioteca-acciones">
          <button class="btn btn-secondary btn-sm bib-descargar">⬇ Archivo</button>
          <button class="btn btn-primary btn-sm bib-importar">Importar</button>
          <button class="btn-icon bib-eliminar" title="Eliminar" style="color:var(--danger)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>`).join("");

    lista.querySelectorAll(".biblioteca-item").forEach((item) => {
      const it = items.find((x) => x.id === item.dataset.id);

      item.querySelector(".bib-descargar").addEventListener("click", () => {
        descargarPlantilla(it.datos);
        toast("Plantilla descargada", "success");
      });

      item.querySelector(".bib-importar").addEventListener("click", async () => {
        const btn = item.querySelector(".bib-importar");
        btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
        try {
          const res = await importarPlantilla(ctx.user.uid, it.datos, () => {});
          cerrar();
          toast(`Importada: ${res.totalSesiones} sesión(es)`, "success");
          alTerminar();
        } catch (err) {
          console.error(err); toast("No se pudo importar", "error");
          btn.disabled = false; btn.textContent = "Importar";
        }
      });

      item.querySelector(".bib-eliminar").addEventListener("click", async () => {
        const ok = await confirmar("Eliminar plantilla", `Se eliminará "${it.nombre}" de tu biblioteca. Las carpetas ya importadas no se ven afectadas.`, { textoOk: "Eliminar", peligro: true });
        if (!ok) return;
        try { await eliminarDeBiblioteca(it.id); toast("Plantilla eliminada", "success"); cargar(); }
        catch (err) { console.error(err); toast("No se pudo eliminar", "error"); }
      });
    });
  };
  cargar();
}
