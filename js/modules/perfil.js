// ══════════════════════════════════════════════════════════
// BOE 2.0 — Módulo: Perfil de usuario (rediseñado)
// ══════════════════════════════════════════════════════════

import { auth } from "../firebase-config.js";
import {
  updateProfile, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { actualizarPerfil, subirFotoPerfil } from "../datos.js";
import {
  toast, confirmar, iniciales, formatoFecha, esc,
  pintarUsuario, temaActual, aplicarTema
} from "../utils/ui.js";
import { errorAuth } from "../auth.js";

export async function render(contenedor, { user }) {
  contenedor.innerHTML = `
    <header class="view-head">
      <div>
        <h1>Mi perfil</h1>
        <p class="view-sub">Administra tu información personal y tus preferencias.</p>
      </div>
    </header>

    <!-- ═══ Tarjeta principal (hero) ═══ -->
    <section class="panel-card perfil-hero">
      <div class="perfil-avatar" id="perfil-avatar">
        ${user.photoURL ? `<img src="${user.photoURL}" alt="Foto de perfil" />` : esc(iniciales(user.displayName))}
      </div>
      <div class="perfil-hero-info">
        <h2 id="perfil-nombre-titulo">${esc(user.displayName || "Usuario")}</h2>
        <p>${esc(user.email)}</p>
        <p class="perfil-meta" id="foto-progreso"></p>
        <div class="perfil-hero-actions">
          <button class="btn btn-secondary btn-sm" id="btn-foto">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            Cambiar foto
          </button>
        </div>
        <input type="file" id="input-foto" hidden accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" />
      </div>
      <div class="perfil-hero-datos">
        <div class="dato-linea"><span>Cuenta creada</span><span>${formatoFecha(user.metadata?.creationTime)}</span></div>
        <div class="dato-linea"><span>Último inicio de sesión</span><span>${formatoFecha(user.metadata?.lastSignInTime)}</span></div>
      </div>
    </section>

    <div class="perfil-grid">

      <!-- ═══ Información personal ═══ -->
      <section class="panel-card perfil-card-sec">
        <div class="card-head">
          <h3>Información personal</h3>
          <p class="view-sub">Tu nombre aparece en el menú y en el historial de cambios.</p>
        </div>
        <form id="form-nombre" novalidate>
          <div class="field">
            <label for="pf-nombre">Nombre completo</label>
            <input type="text" id="pf-nombre" value="${esc(user.displayName || "")}" maxlength="80" required />
          </div>
          <div class="field">
            <label>Correo electrónico</label>
            <input type="email" value="${esc(user.email)}" disabled />
            <p class="field-hint">El correo de acceso no se puede modificar.</p>
          </div>
          <div class="form-inline-actions">
            <button type="submit" class="btn btn-primary" id="btn-guardar-nombre">Guardar cambios</button>
          </div>
        </form>
      </section>

      <!-- ═══ Seguridad ═══ -->
      <section class="panel-card perfil-card-sec">
        <div class="card-head">
          <h3>Seguridad</h3>
          <p class="view-sub">Para cambiar tu contraseña debes confirmar la actual.</p>
        </div>
        <div class="form-alert" id="alert-pass" role="alert"></div>
        <form id="form-pass" novalidate>
          <div class="field">
            <label for="pf-pass-actual">Contraseña actual</label>
            <input type="password" id="pf-pass-actual" autocomplete="current-password" required placeholder="Tu contraseña actual" />
          </div>
          <div class="field">
            <label for="pf-pass-nueva">Nueva contraseña</label>
            <input type="password" id="pf-pass-nueva" autocomplete="new-password" minlength="6" required placeholder="Mínimo 6 caracteres" />
          </div>
          <div class="field">
            <label for="pf-pass-conf">Confirmar nueva contraseña</label>
            <input type="password" id="pf-pass-conf" autocomplete="new-password" minlength="6" required placeholder="Repite la nueva contraseña" />
          </div>
          <div class="form-inline-actions">
            <button type="submit" class="btn btn-primary" id="btn-cambiar-pass">Actualizar contraseña</button>
          </div>
        </form>
      </section>

      <!-- ═══ Preferencias ═══ -->
      <section class="panel-card perfil-card-sec">
        <div class="card-head">
          <h3>Preferencias</h3>
          <p class="view-sub">Personaliza la apariencia de la aplicación.</p>
        </div>
        <div class="switch-row">
          <div>
            <strong style="font-size:14px;color:var(--ink)">Modo oscuro</strong>
            <p class="view-sub" style="margin-top:2px">Cambia toda la interfaz entre tema claro y oscuro.</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="switch-tema" ${temaActual() === "dark" ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <!-- ═══ Sesión ═══ -->
      <section class="panel-card perfil-card-sec">
        <div class="card-head">
          <h3>Sesión</h3>
          <p class="view-sub">Cierra tu sesión de forma segura en este dispositivo.</p>
        </div>
        <button class="btn btn-secondary" id="btn-salir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
          Cerrar sesión
        </button>
      </section>
    </div>
  `;

  // ---------- Foto de perfil ----------
  const inputFoto = contenedor.querySelector("#input-foto");
  contenedor.querySelector("#btn-foto").addEventListener("click", () => inputFoto.click());

  inputFoto.addEventListener("change", async () => {
    const file = inputFoto.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return toast("La foto debe ser PNG, JPG o WEBP.", "error");
    if (file.size > 5 * 1024 * 1024)
      return toast("La foto no puede superar 5 MB.", "error");

    const progresoEl = contenedor.querySelector("#foto-progreso");
    try {
      const { url } = await subirFotoPerfil(user.uid, file, (pct) => {
        progresoEl.textContent = `Subiendo foto… ${pct}%`;
      });
      await updateProfile(auth.currentUser, { photoURL: url });
      await actualizarPerfil(user.uid, { fotoURL: url });
      progresoEl.textContent = "";
      const avatar = contenedor.querySelector("#perfil-avatar");
      avatar.innerHTML = `<img src="${url}" alt="Foto de perfil" />`;
      pintarUsuario(auth.currentUser);
      toast("Foto de perfil actualizada", "success");
    } catch (err) {
      console.error(err);
      progresoEl.textContent = "";
      toast("No se pudo subir la foto. Inténtalo de nuevo.", "error");
    }
  });

  // ---------- Editar nombre ----------
  contenedor.querySelector("#form-nombre").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = contenedor.querySelector("#pf-nombre").value.trim();
    if (nombre.length < 3) return toast("Escribe tu nombre completo.", "error");

    const btn = contenedor.querySelector("#btn-guardar-nombre");
    btn.disabled = true;
    try {
      await updateProfile(auth.currentUser, { displayName: nombre });
      await actualizarPerfil(user.uid, { nombre });
      contenedor.querySelector("#perfil-nombre-titulo").textContent = nombre;
      pintarUsuario(auth.currentUser);
      toast("Nombre actualizado", "success");
    } catch (err) {
      console.error(err);
      toast("No se pudo actualizar el nombre.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Cambiar contraseña ----------
  contenedor.querySelector("#form-pass").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alerta = contenedor.querySelector("#alert-pass");
    alerta.className = "form-alert";

    const actual = contenedor.querySelector("#pf-pass-actual").value;
    const nueva = contenedor.querySelector("#pf-pass-nueva").value;
    const conf = contenedor.querySelector("#pf-pass-conf").value;

    const error = (msg) => { alerta.textContent = msg; alerta.className = "form-alert error"; };

    if (!actual || !nueva || !conf) return error("Completa todos los campos.");
    if (nueva.length < 6) return error("La nueva contraseña debe tener mínimo 6 caracteres.");
    if (nueva !== conf) return error("Las contraseñas nuevas no coinciden.");
    if (nueva === actual) return error("La nueva contraseña debe ser diferente a la actual.");

    const btn = contenedor.querySelector("#btn-cambiar-pass");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Actualizando…`;

    try {
      const credencial = EmailAuthProvider.credential(user.email, actual);
      await reauthenticateWithCredential(auth.currentUser, credencial);
      await updatePassword(auth.currentUser, nueva);
      contenedor.querySelector("#form-pass").reset();
      alerta.textContent = "Contraseña actualizada correctamente.";
      alerta.className = "form-alert success";
      toast("Contraseña actualizada", "success");
    } catch (err) {
      console.error(err);
      error(err.code === "auth/invalid-credential" || err.code === "auth/wrong-password"
        ? "La contraseña actual es incorrecta."
        : errorAuth(err.code));
    } finally {
      btn.disabled = false;
      btn.textContent = "Actualizar contraseña";
    }
  });

  // ---------- Tema ----------
  contenedor.querySelector("#switch-tema").addEventListener("change", (e) => {
    aplicarTema(e.target.checked ? "dark" : "light");
  });

  // ---------- Cerrar sesión ----------
  contenedor.querySelector("#btn-salir").addEventListener("click", async () => {
    const ok = await confirmar("Cerrar sesión", "¿Deseas cerrar tu sesión en este dispositivo?", { textoOk: "Cerrar sesión" });
    if (ok) await signOut(auth);
  });
}
