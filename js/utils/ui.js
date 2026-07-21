// ══════════════════════════════════════════════════════════
// BOE 2.0 — Utilidades de interfaz compartidas
// ══════════════════════════════════════════════════════════

// ---------- Notificaciones (toasts) ----------
const ICONOS = {
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
};

export function toast(mensaje, tipo = "info", duracion = 3400) {
  const zone = document.getElementById("toast-zone");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `${ICONOS[tipo] || ICONOS.info}<span></span>`;
  el.querySelector("span").textContent = mensaje;
  zone.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500); // respaldo
  }, duracion);
}

// ---------- Modales ----------
// abrirModal(html) → { cerrar, el }  ·  el HTML va dentro de .modal
export function abrirModal(html, { grande = false } = {}) {
  const root = document.getElementById("modal-root");
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal ${grande ? "modal-lg" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("visible"));

  const cerrar = () => {
    backdrop.classList.remove("visible");
    setTimeout(() => backdrop.remove(), 220);
    document.removeEventListener("keydown", onEsc);
  };
  const onEsc = (e) => { if (e.key === "Escape") cerrar(); };

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cerrar(); });
  document.addEventListener("keydown", onEsc);

  return { cerrar, el: backdrop.querySelector(".modal") };
}

// confirmar(...) → Promise<boolean>. Para acciones destructivas usar peligro:true
export function confirmar(titulo, mensaje, { textoOk = "Confirmar", peligro = false } = {}) {
  return new Promise((resolve) => {
    const { cerrar, el } = abrirModal(`
      <h3></h3>
      <p class="modal-text"></p>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-x="no">Cancelar</button>
        <button class="btn ${peligro ? "btn-danger" : "btn-primary"}" data-x="si"></button>
      </div>
    `);
    el.querySelector("h3").textContent = titulo;
    el.querySelector(".modal-text").textContent = mensaje;
    el.querySelector('[data-x="si"]').textContent = textoOk;
    el.querySelector('[data-x="no"]').onclick = () => { cerrar(); resolve(false); };
    el.querySelector('[data-x="si"]').onclick = () => { cerrar(); resolve(true); };
  });
}

// ---------- Ayudas varias ----------
export function iniciales(nombre) {
  if (!nombre) return "U";
  const p = nombre.trim().split(/\s+/);
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

export function formatoFecha(valor) {
  if (!valor) return "—";
  const fecha = typeof valor.toDate === "function" ? valor.toDate() : new Date(valor);
  return fecha.toLocaleString("es-CO", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

export function formatoTamano(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Evita inyección de HTML al pintar texto del usuario
export function esc(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

// ---------- Usuario en el menú lateral ----------
// Vive aquí (y no en main.js) para que el módulo de perfil pueda
// refrescar el sidebar sin crear importaciones circulares.
export function pintarUsuario(user) {
  document.getElementById("sidebar-user-name").textContent = user.displayName || "Usuario";
  document.getElementById("sidebar-user-email").textContent = user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) {
    avatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = user.photoURL;
    img.alt = "Foto de perfil";
    avatar.appendChild(img);
  } else {
    avatar.textContent = iniciales(user.displayName);
  }
}

// ---------- Tema claro / oscuro ----------
export function temaActual() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function aplicarTema(tema) {
  if (tema === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("boe-tema", tema);
  pintarIconoTema();
}

export function alternarTema() {
  aplicarTema(temaActual() === "dark" ? "light" : "dark");
}

const SOL = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const LUNA = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

export function pintarIconoTema() {
  const btn = document.getElementById("btn-theme");
  if (btn) btn.innerHTML = temaActual() === "dark" ? SOL : LUNA;
}

// ---------- Fechas (columnas tipo Fecha) ----------
// Interno: ISO "2025-05-10" · Visual: "10/05/2025"
export function formatoFechaCorta(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// Convierte "10/05/2025", "10-05-2025" o ISO → ISO. Devuelve "" si es inválida.
export function aFechaISO(texto) {
  if (!texto) return "";
  const t = String(texto).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return "";
  const d = Number(m[1]), mes = Number(m[2]), a = Number(m[3]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return "";
  const fecha = new Date(a, mes - 1, d);
  if (fecha.getDate() !== d || fecha.getMonth() !== mes - 1) return "";
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------- Compresión de imágenes (logos de carpeta) ----------
// Redimensiona a un máximo de `maxLado` px y convierte a WebP liviano,
// para que las listas carguen rápido sin importar la foto original.
export function comprimirImagen(file, maxLado = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("No se pudo procesar la imagen"));
        resolve(new File([blob], "logo.webp", { type: "image/webp" }));
      }, "image/webp", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen no válida")); };
    img.src = url;
  });
}
