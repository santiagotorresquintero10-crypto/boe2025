// ══════════════════════════════════════════════════════════
// BOE 2.0 — Módulo: Detalle de sesión
//
// ARQUITECTURA DOCUMENTAL POR REFERENCIAS:
//   · Cada fila (paciente) guarda en _grupo el ID de su Grupo
//     Documental. Varias filas pueden apuntar al mismo grupo:
//     comparten EXACTAMENTE los mismos archivos, que existen
//     una sola vez en Storage.
//   · Duplicar un paciente crea la fila apuntando al mismo
//     grupo (sin copiar archivos).
//   · Indicador 🔗 G1, G2… cuando un grupo es compartido.
//   · Administración: desvincular (con copia o vacío) y
//     vincular a un grupo existente.
// ══════════════════════════════════════════════════════════

import { TabulatorFull as Tabulator } from "https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator_esm.min.mjs";
import {
  GRUPOS_DOC, TIPOS_SESION, MESES, nuevoId, filaVacia, grupoVacio, normalizarSesion,
  obtenerSesion, actualizarSesion, renombrarSesion, docsDeGrupo, docsDePaciente, etiquetaPaciente,
  validarDocumentacion, validarArchivo, subirArchivo, eliminarArchivo,
  guardarVersion, listarVersiones
} from "../datos.js";
import {
  toast, abrirModal, confirmar, formatoFecha, formatoFechaCorta, aFechaISO, formatoTamano, esc
} from "../utils/ui.js";

let temporizadorGuardado = null;

export async function render(contenedor, { user, parametro: sesionId }) {
  contenedor.innerHTML = `
    <div class="skeleton sk-line" style="width:220px"></div>
    <div class="skeleton sk-card" style="margin-top:16px;height:320px"></div>
    <div class="skeleton sk-card" style="margin-top:16px"></div>`;

  // Guarda defensiva: un ID vacío o con "/" jamás debe llegar a Firestore
  if (!sesionId || sesionId.includes("/")) {
    contenedor.innerHTML = `<div class="view-error"><h3>Sesión no encontrada</h3><p>La dirección no es válida.</p></div>`;
    return;
  }

  const sesion = await obtenerSesion(sesionId);

  if (!sesion || sesion.uid !== user.uid) {
    contenedor.innerHTML = `<div class="view-error"><h3>Sesión no encontrada</h3><p>Es posible que haya sido eliminada.</p></div>`;
    return;
  }

  if (normalizarSesion(sesion)) {
    try {
      await actualizarSesion(sesion.id, {
        tipo: sesion.tipo, columnas: sesion.columnas,
        filas: sesion.filas, documentos: sesion.documentos
      });
    } catch (e) { console.warn("No se pudo migrar la sesión:", e); }
  }

  const finalizada = sesion.estado === "finalizada";
  const esCirugia = sesion.tipo === "cirugia";

  // ---------- Historial ----------
  let fotografiaPendiente = true;
  let ultimaFotografia = 0;
  const fotografiar = async (motivo) => {
    try {
      await guardarVersion(sesion.id, {
        autor: user.displayName || user.email,
        motivo,
        filas: sesion.filas,
        columnas: sesion.columnas,
        documentos: sesion.documentos
      });
      ultimaFotografia = Date.now();
    } catch (e) { console.warn("No se pudo guardar la versión:", e); }
  };

  contenedor.innerHTML = `
    <a class="view-back" href="#/sesiones${sesion.carpetaId ? "/c/" + sesion.carpetaId + (Number.isInteger(sesion.mes) ? "/m/" + sesion.mes + "/" + (sesion.anio || new Date().getFullYear()) : "") : ""}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      ${Number.isInteger(sesion.mes) ? "Volver a " + MESES[sesion.mes] : "Volver a la carpeta"}
    </a>

    <header class="view-head">
      <div>
        <div class="detalle-head">
          <h1 id="sesion-titulo">${esc(sesion.nombre)}</h1>
          ${finalizada ? "" : `<button class="btn-icon btn-editar-nombre" id="btn-editar-nombre" title="Editar nombre de la sesión">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
          </button>`}
          <span class="tipo-chip ${esCirugia ? "cirugia" : "consulta"}">${TIPOS_SESION[sesion.tipo].titulo}</span>
          <span class="badge ${finalizada ? "badge-finalizada" : "badge-proceso"}">
            ${finalizada ? "Finalizada" : "En proceso"}
          </span>
        </div>
        <p class="view-sub">${esc(sesion.descripcion) || "Creada el " + formatoFecha(sesion.creadaEn)}</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="btn-historial">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          Historial
        </button>
        <span class="save-indicator saved" id="save-indicator">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          Todo guardado
        </span>
      </div>
    </header>

    ${finalizada ? `
      <div class="banner-finalizada">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
        Esta sesión está finalizada. La planilla y los documentos son de solo lectura.
      </div>` : ""}

    <section class="panel-card">
      <div class="card-head">
        <h3>Planilla de pacientes</h3>
        <p class="view-sub">Cada fila es un paciente. El indicador 🔗 muestra pacientes que comparten la misma documentación.</p>
      </div>
      <div class="planilla-tools">
        <div class="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="buscar-planilla" placeholder="Buscar paciente…" />
        </div>
        ${finalizada ? "" : `
          <button class="btn btn-primary btn-sm" id="btn-add-paciente">+ Paciente</button>
          <button class="btn btn-secondary btn-sm" id="btn-importar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v6"/><path d="m9 14 3-3 3 3"/></svg>
            Pegar desde Excel
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-add-col">+ Columna</button>`}
        <button class="btn btn-secondary btn-sm" id="btn-columnas">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
          Gestor de columnas
        </button>
      </div>
      <div id="planilla"></div>
      ${finalizada ? "" : `
        <p class="planilla-hint">
          💡 Clic en una fila abre su formulario · Duplicar (⧉) crea un paciente que <strong>comparte la documentación</strong> del original ·
          ☰ en cada encabezado: renombrar, insertar, ocultar o eliminar la columna · Arrastra ⠿ para reordenar pacientes ·
          "Pegar desde Excel" inserta muchos pacientes de una sola vez.
        </p>`}
    </section>

    <section class="panel-card">
      <div class="card-head">
        <h3>Documentación por paciente</h3>
        <p class="view-sub">
          ${esCirugia
            ? `Sesión de <strong>cirugía</strong>: cada paciente debe tener al menos un archivo en <strong>Informes Quirúrgicos</strong> y en <strong>Autorizaciones</strong>.`
            : `Sesión de <strong>consulta</strong>: los documentos son opcionales.`}
          Los pacientes con 🔗 comparten el mismo grupo de archivos.
        </p>
      </div>
      <div id="resumen-docs"></div>
    </section>

    <section class="finalize-bar" id="finalize-bar"></section>
  `;

  // ══════════════════ GUARDADO ══════════════════

  const indicador = contenedor.querySelector("#save-indicator");
  const marcarGuardando = () => {
    indicador.classList.remove("saved");
    indicador.innerHTML = `<span class="spinner spinner-dark" style="width:12px;height:12px"></span> Guardando…`;
  };
  const marcarGuardado = () => {
    indicador.classList.add("saved");
    indicador.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      Todo guardado`;
  };
  const marcarError = () => {
    indicador.classList.remove("saved");
    indicador.textContent = "Error al guardar";
    toast("No se pudo guardar. Revisa tu conexión.", "error");
  };

  const guardarTodo = async (motivoVersion = null) => {
    marcarGuardando();
    try {
      if (motivoVersion) {
        await fotografiar(motivoVersion);
      } else if (fotografiaPendiente || Date.now() - ultimaFotografia > 5 * 60 * 1000) {
        fotografiaPendiente = false;
        await fotografiar("Edición de planilla");
      }
      sesion.filas = leerFilas();
      limpiarGruposHuerfanos();
      await actualizarSesion(sesion.id, {
        filas: sesion.filas, columnas: sesion.columnas, documentos: sesion.documentos
      });
      marcarGuardado();
      pintarResumenDocs();
      pintarFinalizar();
    } catch (err) { console.error(err); marcarError(); }
  };

  const programarGuardado = () => {
    marcarGuardando();
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => guardarTodo(), 800);
  };

  // ══════════════════ GRUPOS DOCUMENTALES: helpers ══════════════════

  const filasActuales = () => (tabla ? tabla.getData() : sesion.filas);

  const miembrosDe = (gid) => filasActuales().filter((f) => f._grupo === gid);

  // Numeración estable G1, G2… por orden de aparición en la planilla
  const numeroDeGrupo = (gid) => {
    const orden = [];
    for (const f of filasActuales()) if (f._grupo && !orden.includes(f._grupo)) orden.push(f._grupo);
    return orden.indexOf(gid) + 1;
  };

  const nuevaFila = () => {
    const f = filaVacia(sesion.columnas);
    f._grupo = nuevoId();
    sesion.documentos[f._grupo] = grupoVacio();
    return f;
  };

  // Elimina de memoria los grupos sin ningún paciente Y sin archivos
  // (los que tienen archivos se limpian explícitamente con confirmación)
  const limpiarGruposHuerfanos = () => {
    const enUso = new Set(sesion.filas.map((f) => f._grupo));
    for (const gid of Object.keys(sesion.documentos)) {
      if (enUso.has(gid)) continue;
      const d = docsDeGrupo(sesion, gid);
      const n = GRUPOS_DOC.reduce((s, g) => s + d[g.id].length, 0);
      if (n === 0) delete sesion.documentos[gid];
    }
  };

  const borrarArchivosDeGrupo = async (gid) => {
    const d = docsDeGrupo(sesion, gid);
    for (const g of GRUPOS_DOC) {
      for (const a of d[g.id]) if (a.path) await eliminarArchivo(a.path);
    }
    delete sesion.documentos[gid];
  };

  // ══════════════════ TABLA ══════════════════

  let tabla = null;

  const leerFilas = () => {
    if (!tabla) return sesion.filas;
    return tabla.getData().map((f) => {
      const limpia = { _id: f._id || nuevoId(), _grupo: f._grupo };
      sesion.columnas.forEach((c) => (limpia[c.id] = f[c.id] ?? ""));
      return limpia;
    });
  };

  const formatterDocs = (cell) => {
    const fila = cell.getRow().getData();
    const gid = fila._grupo;
    const docs = docsDeGrupo(sesion, gid);
    const total = GRUPOS_DOC.reduce((n, g) => n + docs[g.id].length, 0);
    const completo = GRUPOS_DOC.every((g) => docs[g.id].length > 0);
    const compartido = miembrosDe(gid).length > 1;

    const chipGrupo = compartido
      ? `<span class="grupo-tag" title="Documentación compartida entre ${miembrosDe(gid).length} pacientes">🔗 G${numeroDeGrupo(gid)}</span>`
      : "";

    let boton;
    if (esCirugia) {
      boton = completo
        ? `<button class="docs-btn ok" type="button">✓ Completa · ${total}</button>`
        : `<button class="docs-btn falta" type="button">⚠ Incompleta</button>`;
    } else {
      boton = `<button class="docs-btn ${total ? "ok" : ""}" type="button">📎 ${total}</button>`;
    }
    return `<span class="docs-celda">${boton}${chipGrupo}</span>`;
  };

  const menuColumna = (e, columna) => {
    const def = sesion.columnas.find((c) => c.id === columna.getField());
    if (!def || finalizada) return [];
    return [
      { label: "✏️ Renombrar columna", action: () => modalColumna("renombrar", def) },
      { label: "⬅ Insertar columna a la izquierda", action: () => modalColumna("insertar", def, 0) },
      { label: "➡ Insertar columna a la derecha", action: () => modalColumna("insertar", def, 1) },
      { separator: true },
      { label: "👁 Ocultar columna", action: () => ocultarColumna(def) },
      { separator: true },
      { label: "🗑 Eliminar columna", action: () => eliminarColumna(def) }
    ];
  };

  const ocultarColumna = async (def) => {
    const visibles = sesion.columnas.filter((c) => c.visible !== false);
    if (visibles.length <= 1) return toast("Debe quedar al menos una columna visible.", "error");
    def.visible = false;
    await guardarTodo();
    construirTabla();
  };

  const eliminarColumna = async (def) => {
    if (sesion.columnas.length <= 1) return toast("La planilla debe tener al menos una columna.", "error");
    const ok = await confirmar(
      "Eliminar columna",
      `Se eliminará la columna "${def.titulo}" y su información en todos los pacientes. Esta acción no se puede deshacer.`,
      { textoOk: "Eliminar", peligro: true }
    );
    if (!ok) return;
    sesion.filas = leerFilas();
    await fotografiar(`Columna eliminada: ${def.titulo}`);
    sesion.filas = sesion.filas.map((f) => { const { [def.id]: _, ...resto } = f; return resto; });
    sesion.columnas = sesion.columnas.filter((c) => c.id !== def.id);
    await actualizarSesion(sesion.id, { columnas: sesion.columnas, filas: sesion.filas });
    construirTabla();
    pintarResumenDocs();
    toast("Columna eliminada", "success");
  };

  const construirTabla = () => {
    const datos = sesion.filas.map((f) => ({ ...f }));
    if (tabla) { try { tabla.destroy(); } catch (e) {} }

    const columnas = sesion.columnas
      .filter((c) => c.visible !== false)
      .map((c) => ({
        title: c.titulo,
        field: c.id,
        headerFilter: "input",
        headerFilterPlaceholder: "Filtrar…",
        sorter: c.tipo === "number" ? "number" : "string",
        minWidth: 110,
        width: c.width || undefined,
        resizable: true,
        headerMenu: menuColumna,
        headerContextMenu: menuColumna,
        formatter: (cell) => {
          const v = cell.getValue();
          if (v === "" || v === null || v === undefined) return `<span class="celda-vacia">—</span>`;
          if (c.tipo === "date") return esc(formatoFechaCorta(v));
          return esc(String(v));
        }
      }));

    columnas.push({
      title: "Documentación",
      field: "_docs_",
      hozAlign: "center",
      headerSort: false,
      minWidth: 165,
      formatter: formatterDocs,
      cellClick: (e, cell) => { e.stopPropagation(); abrirDocsPaciente(cell.getRow().getData()._id); }
    });

    if (!finalizada) {
      columnas.push({
        title: "",
        field: "_acciones_",
        hozAlign: "center",
        headerSort: false,
        width: 112,
        minWidth: 112,
        formatter: () => `
          <div class="acciones-fila">
            <button class="btn-accion accion-editar" title="Editar paciente" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            </button>
            <button class="btn-accion accion-duplicar" title="Duplicar paciente (comparte documentación)" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>`,
        cellClick: (e, cell) => {
          e.stopPropagation();
          const id = cell.getRow().getData()._id;
          if (e.target.closest(".accion-duplicar")) duplicarPaciente(id);
          else abrirFormPaciente(id);
        }
      });
    }

    tabla = new Tabulator(contenedor.querySelector("#planilla"), {
      data: datos,
      columns: columnas,
      index: "_id",
      layout: "fitDataStretch",
      height: "440px",
      placeholder: "Sin pacientes. Usa '+ Paciente' o 'Pegar desde Excel' para comenzar.",

      selectableRange: 1,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      clipboard: "copy",
      clipboardCopyStyled: false,
      clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
      clipboardCopyRowRange: "range",

      movableColumns: !finalizada,
      movableRows: !finalizada,
      rowHeader: {
        headerSort: false, resizable: false, frozen: true, width: 44,
        hozAlign: "center", cssClass: "tabulator-range-row-header",
        ...(finalizada ? { formatter: "rownum" } : { rowHandle: true, formatter: "handle" })
      },

      rowContextMenu: finalizada ? undefined : [
        { label: "✏️ Editar paciente", action: (e, fila) => abrirFormPaciente(fila.getData()._id) },
        { label: "⧉ Duplicar paciente (comparte docs)", action: (e, fila) => duplicarPaciente(fila.getData()._id) },
        { label: "📎 Documentación", action: (e, fila) => abrirDocsPaciente(fila.getData()._id) },
        { separator: true },
        { label: "⬆ Insertar paciente arriba", action: (e, fila) => { tabla.addRow(nuevaFila(), true, fila); programarGuardado(); } },
        { label: "⬇ Insertar paciente abajo", action: (e, fila) => { tabla.addRow(nuevaFila(), false, fila); programarGuardado(); } },
        { separator: true },
        { label: "🗑 Eliminar paciente", action: (e, fila) => eliminarPaciente(fila.getData()._id) }
      ]
    });

    if (!finalizada) {
      tabla.on("rowClick", (e, fila) => {
        if (e.target.closest(".docs-btn") || e.target.closest(".acciones-fila") || e.target.closest(".grupo-tag")) return;
        abrirFormPaciente(fila.getData()._id);
      });
    }

    tabla.on("rowMoved", programarGuardado);

    tabla.on("columnMoved", () => {
      const orden = tabla.getColumns().map((c) => c.getField()).filter((f) => f && !f.startsWith("_"));
      sesion.columnas.sort((a, b) => {
        const ia = orden.indexOf(a.id), ib = orden.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
      guardarTodo();
    });

    tabla.on("columnResized", (columna) => {
      const def = sesion.columnas.find((c) => c.id === columna.getField());
      if (def) { def.width = columna.getWidth(); guardarTodo(); }
    });

    const buscador = contenedor.querySelector("#buscar-planilla");
    buscador.oninput = () => {
      const q = buscador.value.trim().toLowerCase();
      if (!q) return tabla.clearFilter(true);
      tabla.setFilter((f) => sesion.columnas.some((c) => String(f[c.id] ?? "").toLowerCase().includes(q)));
    };
  };

  construirTabla();

  // ══════════════════ PACIENTES: eliminar / duplicar ══════════════════

  const eliminarPaciente = async (filaId) => {
    sesion.filas = leerFilas();
    const pos = sesion.filas.findIndex((f) => f._id === filaId);
    if (pos === -1) return false;
    const fila = sesion.filas[pos];
    const gid = fila._grupo;
    const compartido = miembrosDe(gid).length > 1;
    const d = docsDeGrupo(sesion, gid);
    const nArchivos = GRUPOS_DOC.reduce((n, g) => n + d[g.id].length, 0);

    const mensaje = compartido
      ? `Se eliminará "${etiquetaPaciente(sesion, fila, pos + 1)}". Su documentación es compartida (🔗 G${numeroDeGrupo(gid)}), así que los archivos se conservarán para los demás pacientes del grupo.`
      : `Se eliminará "${etiquetaPaciente(sesion, fila, pos + 1)}"${nArchivos ? ` y sus ${nArchivos} archivo(s) adjunto(s)` : ""}. Esta acción no se puede deshacer.`;

    const ok = await confirmar("Eliminar paciente", mensaje, { textoOk: "Eliminar", peligro: true });
    if (!ok) return false;

    await fotografiar("Paciente eliminado");
    if (!compartido && nArchivos > 0) await borrarArchivosDeGrupo(gid);
    try { tabla.deleteRow(filaId); } catch (e) {}
    await guardarTodo();
    tabla?.redraw(true);
    toast("Paciente eliminado", "success");
    return true;
  };

  // Duplicar = nueva fila que COMPARTE el grupo documental del original.
  // Los archivos existen una sola vez; cualquier cambio se refleja en ambos.
  const duplicarPaciente = async (filaId) => {
    sesion.filas = leerFilas();
    const pos = sesion.filas.findIndex((f) => f._id === filaId);
    if (pos === -1) return;
    const original = sesion.filas[pos];

    const nuevo = { ...original, _id: nuevoId() }; // conserva _grupo → comparte docs
    await tabla.addRow(nuevo, false, filaId);
    await guardarTodo("Paciente duplicado (documentación compartida)");
    tabla?.redraw(true);

    const d = docsDeGrupo(sesion, original._grupo);
    const nArchivos = GRUPOS_DOC.reduce((n, g) => n + d[g.id].length, 0);
    toast(
      nArchivos > 0
        ? `Paciente duplicado 🔗 — comparte los ${nArchivos} archivo(s) del original`
        : "Paciente duplicado 🔗 — compartirá la documentación del original",
      "success"
    );
  };

  // ══════════════════ FORMULARIO DE PACIENTE ══════════════════

  function abrirFormPaciente(filaId = null) {
    sesion.filas = leerFilas();
    const existente = filaId ? sesion.filas.find((f) => f._id === filaId) : null;
    const pos = existente ? sesion.filas.findIndex((f) => f._id === filaId) : sesion.filas.length;
    const datos = existente ? { ...existente } : nuevaFila();

    const { cerrar, el } = abrirModal(`
      <h3 style="margin-bottom:2px">${existente ? "Editar paciente" : "Nuevo paciente"}</h3>
      <p class="modal-text">${existente ? `Registro #${pos + 1} de la planilla.` : "Se agregará al final de la planilla."}</p>
      <form id="form-paciente" novalidate>
        <div class="form-paciente-grid">
          ${sesion.columnas.map((c) => `
            <div class="field">
              <label for="fp-${c.id}">${esc(c.titulo)}${c.visible === false ? ` <span class="col-oculta-tag">oculta</span>` : ""}</label>
              <input type="${c.tipo === "number" ? "number" : c.tipo === "date" ? "date" : "text"}" id="fp-${c.id}" data-col="${c.id}"
                     value="${esc(String(datos[c.id] ?? ""))}" placeholder="—" ${c.tipo === "number" ? 'step="any"' : ""} />
            </div>`).join("")}
        </div>
        <div class="modal-actions" style="justify-content:space-between">
          <div>
            ${existente ? `<button type="button" class="btn btn-ghost-danger" id="fp-eliminar">Eliminar paciente</button>` : ""}
          </div>
          <div style="display:flex;gap:10px">
            <button type="button" class="btn btn-secondary" id="fp-cancelar">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="fp-guardar">${existente ? "Guardar cambios" : "Agregar paciente"}</button>
          </div>
        </div>
      </form>
    `, { grande: true });

    const primerInput = el.querySelector(".form-paciente-grid input");
    primerInput?.focus();
    el.querySelector("#fp-cancelar").addEventListener("click", cerrar);

    el.querySelector("#fp-eliminar")?.addEventListener("click", async () => {
      const eliminado = await eliminarPaciente(filaId);
      if (eliminado) cerrar();
    });

    el.querySelector("#form-paciente").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = el.querySelector("#fp-guardar");
      btn.disabled = true;

      const nuevo = { _id: datos._id, _grupo: datos._grupo };
      el.querySelectorAll("[data-col]").forEach((input) => (nuevo[input.dataset.col] = input.value));

      try {
        if (existente) {
          await tabla.updateData([nuevo]);
        } else {
          await tabla.addData([nuevo]);
          const filas = tabla.getRows();
          filas[filas.length - 1]?.getElement()?.scrollIntoView({ block: "nearest" });
        }
        await guardarTodo();
        tabla?.redraw(true);
        cerrar();
        toast(existente ? "Paciente actualizado" : "Paciente agregado", "success");
        if (!existente && esCirugia) {
          setTimeout(() => abrirDocsPaciente(nuevo._id), 250);
        }
      } catch (err) {
        console.error(err);
        toast("No se pudo guardar el paciente.", "error");
        btn.disabled = false;
      }
    });
  }

  if (!finalizada) {
    contenedor.querySelector("#btn-add-paciente").addEventListener("click", () => abrirFormPaciente());
    contenedor.querySelector("#btn-add-col").addEventListener("click", () => modalColumna("nueva"));
    contenedor.querySelector("#btn-importar").addEventListener("click", modalImportar);
  }

  // ══════════════════ IMPORTAR DESDE EXCEL ══════════════════

  function modalImportar() {
    const visibles = sesion.columnas.filter((c) => c.visible !== false);
    const { cerrar, el } = abrirModal(`
      <h3>Pegar desde Excel</h3>
      <p class="modal-text">
        Copia las filas en Excel o Google Sheets (sin encabezados) y pégalas aquí.
        Las columnas se asignarán en este orden: <strong>${visibles.map((c) => esc(c.titulo)).join(" → ")}</strong>.
      </p>
      <div class="field">
        <textarea id="imp-texto" rows="8" placeholder="Pega aquí las filas copiadas…" style="font-family:monospace;font-size:13px"></textarea>
        <p class="field-hint" id="imp-conteo">0 filas detectadas</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="imp-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primary" id="imp-agregar" disabled>Agregar pacientes</button>
      </div>
    `, { grande: true });

    const area = el.querySelector("#imp-texto");
    const conteo = el.querySelector("#imp-conteo");
    const btnAgregar = el.querySelector("#imp-agregar");
    area.focus();

    const parsear = () => area.value
      .split(/\r?\n/)
      .map((l) => l.replace(/\r/g, ""))
      .filter((l) => l.trim() !== "")
      .map((l) => l.split("\t"));

    area.addEventListener("input", () => {
      const filas = parsear();
      conteo.textContent = `${filas.length} fila(s) detectada(s)`;
      btnAgregar.disabled = filas.length === 0;
      btnAgregar.textContent = filas.length ? `Agregar ${filas.length} paciente(s)` : "Agregar pacientes";
    });

    el.querySelector("#imp-cancelar").addEventListener("click", cerrar);

    btnAgregar.addEventListener("click", async () => {
      const filasTexto = parsear();
      if (!filasTexto.length) return;
      btnAgregar.disabled = true;
      btnAgregar.innerHTML = `<span class="spinner"></span>Agregando…`;

      const nuevas = filasTexto.map((celdas) => {
        const fila = nuevaFila();
        visibles.forEach((c, i) => {
          const v = (celdas[i] ?? "").trim();
          fila[c.id] = c.tipo === "date" ? (aFechaISO(v) || v) : v;
        });
        return fila;
      });

      try {
        await tabla.addData(nuevas);
        await guardarTodo(`Importación desde Excel (${nuevas.length} pacientes)`);
        cerrar();
        toast(`${nuevas.length} paciente(s) agregados`, "success");
      } catch (err) {
        console.error(err);
        toast("No se pudo importar la información.", "error");
        btnAgregar.disabled = false;
        btnAgregar.textContent = "Agregar pacientes";
      }
    });
  }

  // ══════════════════ GESTOR DE COLUMNAS ══════════════════

  contenedor.querySelector("#btn-columnas").addEventListener("click", () => {
    let borrador = sesion.columnas.map((c) => ({ ...c, _eliminar: false }));

    const { cerrar, el } = abrirModal(`
      <h3>Gestor de columnas</h3>
      <p class="modal-text">Renombra, reordena, oculta o elimina cualquier columna — incluidas las predeterminadas.</p>
      <div class="colman-list" id="colman-list"></div>
      ${finalizada ? "" : `<button class="btn btn-secondary btn-sm" id="colman-nueva" style="margin-top:12px">+ Nueva columna</button>`}
      <div class="modal-actions">
        <button class="btn btn-secondary" id="colman-cancelar">Cancelar</button>
        ${finalizada ? "" : `<button class="btn btn-primary" id="colman-guardar">Guardar cambios</button>`}
      </div>
    `, { grande: true });

    const lista = el.querySelector("#colman-list");

    const pintar = () => {
      lista.innerHTML = borrador.map((c, i) => `
        <div class="colman-item ${c._eliminar ? "eliminando" : ""}" data-i="${i}">
          <div class="colman-orden">
            <button class="btn-icon mv-up" title="Subir" ${i === 0 || finalizada ? "disabled" : ""}>▲</button>
            <button class="btn-icon mv-down" title="Bajar" ${i === borrador.length - 1 || finalizada ? "disabled" : ""}>▼</button>
          </div>
          <input type="text" class="colman-nombre" value="${esc(c.titulo)}" maxlength="40" ${finalizada || c._eliminar ? "disabled" : ""} />
          <select class="colman-tipo-sel" ${finalizada || c._eliminar ? "disabled" : ""}>
            <option value="text" ${!c.tipo || c.tipo === "text" ? "selected" : ""}>Texto</option>
            <option value="number" ${c.tipo === "number" ? "selected" : ""}>Número</option>
            <option value="date" ${c.tipo === "date" ? "selected" : ""}>Fecha</option>
          </select>
          <label class="check" title="Visible">
            <input type="checkbox" class="colman-visible" ${c.visible !== false ? "checked" : ""} ${finalizada || c._eliminar ? "disabled" : ""} />
            Visible
          </label>
          ${finalizada ? "" : `
            <button class="btn-icon colman-del" title="${c._eliminar ? "Deshacer eliminación" : "Eliminar columna"}" style="color:${c._eliminar ? "var(--ink-soft)" : "var(--danger)"}">
              ${c._eliminar
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`}
            </button>`}
        </div>`).join("");

      lista.querySelectorAll(".colman-item").forEach((item) => {
        const i = Number(item.dataset.i);
        item.querySelector(".mv-up")?.addEventListener("click", () => {
          [borrador[i - 1], borrador[i]] = [borrador[i], borrador[i - 1]];
          pintar();
        });
        item.querySelector(".mv-down")?.addEventListener("click", () => {
          [borrador[i + 1], borrador[i]] = [borrador[i], borrador[i + 1]];
          pintar();
        });
        item.querySelector(".colman-nombre")?.addEventListener("input", (e) => {
          borrador[i].titulo = e.target.value;
        });
        item.querySelector(".colman-visible")?.addEventListener("change", (e) => {
          borrador[i].visible = e.target.checked;
        });
        item.querySelector(".colman-tipo-sel")?.addEventListener("change", (e) => {
          borrador[i].tipo = e.target.value;
        });
        item.querySelector(".colman-del")?.addEventListener("click", () => {
          borrador[i]._eliminar = !borrador[i]._eliminar;
          pintar();
        });
      });
    };
    pintar();

    el.querySelector("#colman-cancelar").addEventListener("click", cerrar);

    el.querySelector("#colman-nueva")?.addEventListener("click", () => {
      borrador.push({ id: nuevoId(), titulo: "Nueva columna", tipo: "text", visible: true, _eliminar: false, _nueva: true });
      pintar();
      lista.querySelector(".colman-item:last-child .colman-nombre")?.select();
    });

    el.querySelector("#colman-guardar")?.addEventListener("click", async () => {
      const finales = borrador.filter((c) => !c._eliminar);
      if (!finales.length) return toast("La planilla debe tener al menos una columna.", "error");
      if (!finales.some((c) => c.visible !== false)) return toast("Debe quedar al menos una columna visible.", "error");
      if (finales.some((c) => !c.titulo.trim())) return toast("Ninguna columna puede quedar sin nombre.", "error");

      const eliminadas = borrador.filter((c) => c._eliminar && !c._nueva);
      if (eliminadas.length) {
        const ok = await confirmar(
          "Eliminar columnas",
          `Se eliminarán ${eliminadas.length} columna(s): ${eliminadas.map((c) => c.titulo).join(", ")}. Su información se perderá en todos los pacientes.`,
          { textoOk: "Eliminar y guardar", peligro: true }
        );
        if (!ok) return;
      }

      sesion.filas = leerFilas();
      if (eliminadas.length) {
        await fotografiar(`Columnas eliminadas: ${eliminadas.map((c) => c.titulo).join(", ")}`);
        const idsEliminar = new Set(eliminadas.map((c) => c.id));
        sesion.filas = sesion.filas.map((f) => {
          const limpia = {};
          Object.keys(f).forEach((k) => { if (!idsEliminar.has(k)) limpia[k] = f[k]; });
          return limpia;
        });
      }
      finales.forEach((c) => {
        c.titulo = c.titulo.trim();
        c._nueva && sesion.filas.forEach((f) => (f[c.id] = f[c.id] ?? ""));
        delete c._eliminar; delete c._nueva;
      });
      sesion.columnas = finales;

      await actualizarSesion(sesion.id, { columnas: sesion.columnas, filas: sesion.filas });
      construirTabla();
      pintarResumenDocs();
      cerrar();
      toast("Columnas actualizadas", "success");
    });
  });

  function modalColumna(modo, refDef = null, desplazamiento = 0) {
    const titulos = { nueva: "Nueva columna", renombrar: "Renombrar columna", insertar: "Insertar columna" };
    const { cerrar, el } = abrirModal(`
      <h3>${titulos[modo]}</h3>
      <form id="form-col" novalidate>
        <div class="field">
          <label for="col-nombre">Nombre de la columna</label>
          <input type="text" id="col-nombre" maxlength="40" required
                 value="${modo === "renombrar" ? esc(refDef.titulo) : ""}"
                 placeholder="Ej: Teléfono, EPS, Fecha…" />
        </div>
        ${modo === "renombrar" ? "" : `
        <div class="field">
          <label for="col-tipo">Tipo de dato</label>
          <select id="col-tipo">
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="date">Fecha</option>
          </select>
        </div>`}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="col-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primary">${modo === "renombrar" ? "Guardar" : "Crear columna"}</button>
        </div>
      </form>
    `);

    const inputNombre = el.querySelector("#col-nombre");
    inputNombre.focus(); inputNombre.select();
    el.querySelector("#col-cancelar").addEventListener("click", cerrar);

    el.querySelector("#form-col").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = inputNombre.value.trim();
      if (!nombre) return toast("Escribe un nombre para la columna.", "error");

      sesion.filas = leerFilas();

      if (modo === "renombrar") {
        refDef.titulo = nombre;
      } else {
        const nueva = { id: nuevoId(), titulo: nombre, tipo: el.querySelector("#col-tipo").value, visible: true };
        sesion.filas.forEach((f) => (f[nueva.id] = ""));
        if (modo === "insertar" && refDef) {
          const i = sesion.columnas.findIndex((c) => c.id === refDef.id);
          sesion.columnas.splice(i + desplazamiento, 0, nueva);
        } else {
          sesion.columnas.push(nueva);
        }
      }

      await actualizarSesion(sesion.id, { columnas: sesion.columnas, filas: sesion.filas });
      construirTabla();
      cerrar();
      toast(modo === "renombrar" ? "Columna renombrada" : "Columna creada", "success");
    });
  }

  // ══════════════════ RESUMEN DE DOCUMENTACIÓN ══════════════════

  function pintarResumenDocs() {
    const zona = contenedor.querySelector("#resumen-docs");
    const filas = sesion.filas;

    zona.innerHTML = filas.map((f, i) => {
      const gid = f._grupo;
      const docs = docsDeGrupo(sesion, gid);
      const total = GRUPOS_DOC.reduce((n, g) => n + docs[g.id].length, 0);
      const completo = GRUPOS_DOC.every((g) => docs[g.id].length > 0);
      const compartido = miembrosDe(gid).length > 1;
      const etiqueta = etiquetaPaciente(sesion, f, i + 1);

      return `
        <div class="paciente-item" data-fila="${f._id}">
          <div class="paciente-num">${i + 1}</div>
          <div class="paciente-info">
            <strong>${esc(etiqueta)} ${compartido ? `<span class="grupo-tag">🔗 G${numeroDeGrupo(gid)}</span>` : ""}</strong>
            <span>${GRUPOS_DOC.map((g) => `${g.titulo}: ${docs[g.id].length}`).join(" · ")}${compartido ? ` · compartida entre ${miembrosDe(gid).length} pacientes` : ""}</span>
          </div>
          ${esCirugia
            ? `<span class="req-chip ${completo ? "done" : ""}">${completo ? "✓ Completa" : "Incompleta"}</span>`
            : `<span class="docs-chip ${total ? "ok" : ""}">📎 ${total}</span>`}
          <button class="btn btn-secondary btn-sm">Abrir</button>
        </div>`;
    }).join("") || `<p class="view-sub">Agrega pacientes a la planilla para gestionar su documentación.</p>`;

    zona.querySelectorAll(".paciente-item").forEach((item) => {
      item.querySelector("button").addEventListener("click", () => abrirDocsPaciente(item.dataset.fila));
    });
  }

  // ══════════════════ DOCUMENTACIÓN (por grupo compartible) ══════════════════

  function abrirDocsPaciente(filaId) {
    sesion.filas = leerFilas();
    const pos = sesion.filas.findIndex((f) => f._id === filaId);
    if (pos === -1) return;
    const fila = sesion.filas[pos];
    const gid = fila._grupo;
    const etiqueta = etiquetaPaciente(sesion, fila, pos + 1);

    const miembros = miembrosDe(gid);
    const compartido = miembros.length > 1;
    const otros = miembros
      .filter((m) => m._id !== filaId)
      .map((m) => etiquetaPaciente(sesion, m, sesion.filas.findIndex((x) => x._id === m._id) + 1));

    const { cerrar, el } = abrirModal(`
      <h3 style="margin-bottom:2px">Documentación · ${esc(etiqueta)}</h3>
      <p class="modal-text">${esCirugia ? "Para completar este paciente carga al menos un archivo en cada grupo." : "Los documentos son opcionales en sesiones de consulta."}</p>

      ${compartido ? `
        <div class="banner-compartido">
          <span class="grupo-tag grande">🔗 Grupo G${numeroDeGrupo(gid)}</span>
          <span>Documentación <strong>compartida</strong> con: ${otros.map((n) => esc(n)).join(", ")}. Cualquier cambio se refleja en todos.</span>
        </div>` : ""}

      ${finalizada ? "" : `
        <div class="grupo-admin">
          ${compartido ? `<button class="btn btn-secondary btn-sm" id="btn-desvincular">Desvincular de este grupo</button>` : ""}
          <button class="btn btn-secondary btn-sm" id="btn-vincular">Vincular a otro grupo…</button>
        </div>`}

      <div id="grupos-doc"></div>
      <div class="modal-actions"><button class="btn btn-primary" id="docs-listo">Listo</button></div>
    `, { grande: true });

    const refrescarFuera = () => {
      tabla?.redraw(true);
      pintarResumenDocs();
      pintarFinalizar();
    };

    el.querySelector("#docs-listo").addEventListener("click", () => { cerrar(); refrescarFuera(); });

    // ----- Desvincular: crear un grupo independiente para esta fila -----
    el.querySelector("#btn-desvincular")?.addEventListener("click", async () => {
      const d = docsDeGrupo(sesion, gid);
      const nArchivos = GRUPOS_DOC.reduce((n, g) => n + d[g.id].length, 0);

      const eleccion = await new Promise((resolve) => {
        const m = abrirModal(`
          <h3>Desvincular paciente</h3>
          <p class="modal-text">"${esc(etiqueta)}" dejará de compartir la documentación del grupo G${numeroDeGrupo(gid)} y tendrá su propio grupo independiente. ¿Cómo quieres empezar?</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" data-x="cancelar">Cancelar</button>
            <button class="btn btn-secondary" data-x="vacio">Con documentación vacía</button>
            ${nArchivos ? `<button class="btn btn-primary" data-x="copia">Con una copia de los ${nArchivos} archivo(s)</button>` : ""}
          </div>`);
        m.el.querySelectorAll("[data-x]").forEach((b) =>
          b.addEventListener("click", () => { m.cerrar(); resolve(b.dataset.x); }));
      });
      if (eleccion === "cancelar") return;

      const nuevoGrupo = nuevoId();
      sesion.documentos[nuevoGrupo] = grupoVacio();

      if (eleccion === "copia" && nArchivos) {
        toast(`Copiando ${nArchivos} archivo(s)…`, "info");
        for (const g of GRUPOS_DOC) {
          for (const a of d[g.id]) {
            try {
              const resp = await fetch(a.url);
              const blob = await resp.blob();
              const file = new File([blob], a.nombre, { type: a.tipo });
              const meta = await subirArchivo(user.uid, sesion.id, nuevoGrupo, g.id, file, () => {});
              sesion.documentos[nuevoGrupo][g.id].push(meta);
            } catch (err) {
              console.error(err);
              toast(`No se pudo copiar "${a.nombre}".`, "error");
            }
          }
        }
      }

      fila._grupo = nuevoGrupo;
      await tabla.updateData([{ _id: filaId, _grupo: nuevoGrupo }]);
      await guardarTodo(`Paciente desvinculado del grupo (${eleccion === "copia" ? "con copia de archivos" : "documentación vacía"})`);
      toast("Paciente desvinculado — ahora tiene su propio grupo", "success");
      cerrar();
      refrescarFuera();
      abrirDocsPaciente(filaId);
    });

    // ----- Vincular a otro grupo existente -----
    el.querySelector("#btn-vincular")?.addEventListener("click", () => {
      const grupos = [];
      for (const f of sesion.filas) {
        if (f._grupo !== gid && !grupos.includes(f._grupo)) grupos.push(f._grupo);
      }
      if (!grupos.length) return toast("No hay otros grupos documentales en esta sesión.", "info");

      const m = abrirModal(`
        <h3>Vincular a otro grupo</h3>
        <p class="modal-text">"${esc(etiqueta)}" pasará a compartir la documentación del grupo que elijas. ${docsDeGrupo(sesion, gid) && miembrosDe(gid).length === 1 && GRUPOS_DOC.reduce((n, g) => n + docsDeGrupo(sesion, gid)[g.id].length, 0) > 0 ? "<strong>Su grupo actual quedará sin pacientes y sus archivos se eliminarán.</strong>" : ""}</p>
        <div class="mover-lista">
          ${grupos.map((g2) => {
            const dg = docsDeGrupo(sesion, g2);
            const n = GRUPOS_DOC.reduce((s, g) => s + dg[g.id].length, 0);
            const nombres = miembrosDe(g2).map((x) => etiquetaPaciente(sesion, x, sesion.filas.findIndex((y) => y._id === x._id) + 1));
            return `
              <button class="mover-item" data-g="${g2}">
                <span class="grupo-tag grande">🔗 G${numeroDeGrupo(g2)}</span>
                <span style="flex:1;min-width:0">
                  <strong style="display:block;font-size:13.5px">${nombres.map((x) => esc(x)).join(", ")}</strong>
                  <span style="font-size:12px;color:var(--ink-soft)">${n} archivo(s)</span>
                </span>
              </button>`;
          }).join("")}
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" id="vg-cancelar">Cancelar</button></div>
      `);

      m.el.querySelector("#vg-cancelar").addEventListener("click", m.cerrar);
      m.el.querySelectorAll(".mover-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const destino = btn.dataset.g;
          const grupoAnterior = fila._grupo;

          fila._grupo = destino;
          await tabla.updateData([{ _id: filaId, _grupo: destino }]);

          // Si el grupo anterior quedó sin pacientes, limpiar sus archivos
          if (miembrosDe(grupoAnterior).length === 0) {
            await borrarArchivosDeGrupo(grupoAnterior);
          }

          await guardarTodo(`Paciente vinculado al grupo G${numeroDeGrupo(destino)}`);
          toast("Paciente vinculado — ahora comparte esa documentación 🔗", "success");
          m.cerrar();
          cerrar();
          refrescarFuera();
          abrirDocsPaciente(filaId);
        });
      });
    });

    // ----- Pintar y operar los grupos documentales -----
    const pintarGrupos = () => {
      const docs = docsDeGrupo(sesion, gid);
      el.querySelector("#grupos-doc").innerHTML = GRUPOS_DOC.map((g) => `
        <div class="grupo-doc" data-grupo="${g.id}">
          <div class="grupo-head">
            <h4>${g.titulo}</h4>
            <span class="req-chip ${docs[g.id].length ? "done" : ""}">${docs[g.id].length ? `✓ ${docs[g.id].length} archivo${docs[g.id].length === 1 ? "" : "s"}` : (esCirugia ? "Obligatorio" : "Opcional")}</span>
          </div>
          <div class="archivo-list">${docs[g.id].map((a) => archivoHTML(a)).join("")}</div>
          ${finalizada ? "" : `
          <div class="grupo-drop">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>
            <span>Arrastra archivos aquí o</span>
            <button class="btn btn-secondary btn-sm btn-agregar">Seleccionar archivos</button>
            <input type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" />
          </div>
          <div class="subidas-activas"></div>`}
        </div>`).join("");
      conectarGrupos();
    };

    const archivoHTML = (a) => {
      const esPdf = a.tipo === "application/pdf";
      return `
        <div class="archivo-item" data-archivo="${a.id}">
          ${esPdf
            ? `<div class="doc-icon pdf mini"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg></div>`
            : `<img class="doc-thumb mini act-ver" src="${a.url}" alt="" />`}
          <div class="doc-data">
            <div class="doc-name">${esc(a.nombre)}</div>
            <div class="doc-meta">${esPdf ? "PDF" : "Imagen"} · ${formatoTamano(a.tamano)} · ${formatoFecha(a.fechaCarga)}</div>
          </div>
          <div class="archivo-actions">
            <button class="btn-icon act-ver" title="Ver"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <a class="btn-icon" href="${a.url}" target="_blank" rel="noopener" download title="Descargar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg></a>
            ${finalizada ? "" : `
              <button class="btn-icon act-reemplazar" title="Reemplazar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg></button>
              <button class="btn-icon act-eliminar" title="Eliminar" style="color:var(--danger)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
              <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" />`}
          </div>
        </div>`;
    };

    const conectarGrupos = () => {
      el.querySelectorAll(".grupo-doc").forEach((grupoEl) => {
        const tipoGrupo = grupoEl.dataset.grupo; // "informes" | "autorizaciones"

        grupoEl.querySelectorAll(".archivo-item").forEach((itemEl) => {
          const archivoId = itemEl.dataset.archivo;
          const docs = docsDeGrupo(sesion, gid);
          const archivo = docs[tipoGrupo].find((a) => a.id === archivoId);
          if (!archivo) return;
          const esPdf = archivo.tipo === "application/pdf";

          itemEl.querySelectorAll(".act-ver").forEach((b) => b.addEventListener("click", () => {
            abrirModal(`
              <h3 style="margin-bottom:14px">${esc(archivo.nombre)}</h3>
              ${esPdf
                ? `<iframe class="preview-frame" src="${archivo.url}" title="Vista previa"></iframe>`
                : `<img class="preview-frame" src="${archivo.url}" alt="Vista previa" />`}
              <div class="modal-actions"><a class="btn btn-secondary" href="${archivo.url}" target="_blank" rel="noopener">Abrir en pestaña nueva</a></div>
            `, { grande: true });
          }));

          if (finalizada) return;

          const inputFile = itemEl.querySelector("input[type=file]");
          itemEl.querySelector(".act-reemplazar").addEventListener("click", () => inputFile.click());
          inputFile.addEventListener("change", async () => {
            const file = inputFile.files[0];
            if (!file) return;
            const err = validarArchivo(file);
            if (err) return toast(err, "error");
            await subirLote(tipoGrupo, [file], archivo);
          });

          itemEl.querySelector(".act-eliminar").addEventListener("click", async () => {
            const aviso = compartido
              ? `Se eliminará "${archivo.nombre}" para TODOS los pacientes del grupo G${numeroDeGrupo(gid)}.`
              : `Se eliminará "${archivo.nombre}".`;
            const ok = await confirmar("Eliminar documento", aviso, { textoOk: "Eliminar", peligro: true });
            if (!ok) return;
            await fotografiar(`Documento eliminado: ${archivo.nombre}`);
            await eliminarArchivo(archivo.path);
            const lista = docsDeGrupo(sesion, gid);
            sesion.documentos[gid] = { ...lista, [tipoGrupo]: lista[tipoGrupo].filter((a) => a.id !== archivoId) };
            await actualizarSesion(sesion.id, { documentos: sesion.documentos });
            toast("Documento eliminado", "success");
            pintarGrupos();
            refrescarFuera();
          });
        });

        if (finalizada) return;

        const inputMulti = grupoEl.querySelector(".grupo-drop input[type=file]");
        grupoEl.querySelector(".btn-agregar").addEventListener("click", () => inputMulti.click());
        inputMulti.addEventListener("change", () => {
          if (inputMulti.files.length) subirLote(tipoGrupo, [...inputMulti.files]);
        });

        const drop = grupoEl.querySelector(".grupo-drop");
        ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragover"); }));
        ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragover"); }));
        drop.addEventListener("drop", (e) => {
          const files = [...e.dataTransfer.files];
          if (files.length) subirLote(tipoGrupo, files);
        });
      });
    };

    const subirLote = async (tipoGrupo, files, reemplaza = null) => {
      const validos = [];
      for (const f of files) {
        const err = validarArchivo(f);
        if (err) toast(err, "error");
        else validos.push(f);
      }
      if (!validos.length) return;

      const grupoEl = el.querySelector(`.grupo-doc[data-grupo="${tipoGrupo}"]`);
      const zonaSubidas = grupoEl.querySelector(".subidas-activas");

      if (!reemplaza) await fotografiar(`Documentos cargados en ${GRUPOS_DOC.find((g) => g.id === tipoGrupo).titulo} (${validos.length})`);
      else await fotografiar(`Documento reemplazado: ${reemplaza.nombre}`);

      for (const file of validos) {
        const barra = document.createElement("div");
        barra.className = "subida-item";
        barra.innerHTML = `
          <span class="doc-name">${esc(file.name)}</span>
          <div class="progress-track"><div class="progress-fill"></div></div>
          <span class="progress-label">0%</span>`;
        zonaSubidas.appendChild(barra);

        try {
          const meta = await subirArchivo(user.uid, sesion.id, gid, tipoGrupo, file, (pct) => {
            barra.querySelector(".progress-fill").style.width = pct + "%";
            barra.querySelector(".progress-label").textContent = pct + "%";
          });

          const docs = docsDeGrupo(sesion, gid);
          let lista = [...docs[tipoGrupo]];
          if (reemplaza) {
            await eliminarArchivo(reemplaza.path);
            lista = lista.map((a) => (a.id === reemplaza.id ? meta : a));
          } else {
            lista.push(meta);
          }
          sesion.documentos[gid] = { ...docs, [tipoGrupo]: lista };
          await actualizarSesion(sesion.id, { documentos: sesion.documentos });
        } catch (err) {
          console.error(err);
          toast(`No se pudo subir "${file.name}".`, "error");
        } finally {
          barra.remove();
        }
      }

      toast(reemplaza ? "Documento reemplazado" : "Archivos cargados correctamente", "success");
      pintarGrupos();
      refrescarFuera();
    };

    pintarGrupos();
  }

  pintarResumenDocs();

  // ══════════════════ HISTORIAL ══════════════════

  contenedor.querySelector("#btn-historial").addEventListener("click", async () => {
    const { cerrar, el } = abrirModal(`
      <h3>Historial de versiones</h3>
      <p class="modal-text">Cada cambio importante guarda una fotografía del contenido. Puedes consultar o restaurar cualquier versión.</p>
      <div class="version-list" id="version-list"><div class="skeleton sk-card"></div></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="hist-cerrar">Cerrar</button></div>
    `, { grande: true });

    el.querySelector("#hist-cerrar").addEventListener("click", cerrar);
    const lista = el.querySelector("#version-list");

    let versiones;
    try { versiones = await listarVersiones(sesion.id); }
    catch (err) {
      console.error(err);
      lista.innerHTML = `<p class="view-sub">No se pudo cargar el historial.</p>`;
      return;
    }

    if (!versiones.length) {
      lista.innerHTML = `<p class="view-sub">Aún no hay versiones guardadas. Se crearán automáticamente a medida que edites la sesión.</p>`;
      return;
    }

    lista.innerHTML = versiones.map((v, i) => `
      <div class="version-item" data-i="${i}">
        <div class="version-dot">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
        </div>
        <div class="version-info">
          <strong>${esc(v.motivo)}</strong>
          <span>${formatoFecha(v.fecha)} · ${esc(v.autor)} · ${(v.filas || []).length} paciente(s) · ${v.totalArchivos ?? 0} archivo(s)</span>
        </div>
        <div class="version-actions">
          <button class="btn btn-secondary btn-sm ver-version">Ver</button>
          ${finalizada ? "" : `<button class="btn btn-secondary btn-sm restaurar-version">Restaurar</button>`}
        </div>
      </div>`).join("");

    lista.querySelectorAll(".version-item").forEach((item) => {
      const v = versiones[Number(item.dataset.i)];
      const colsV = (v.columnas && v.columnas.length ? v.columnas : sesion.columnas);

      item.querySelector(".ver-version").addEventListener("click", () => {
        const filas = v.filas || [];
        abrirModal(`
          <h3 style="margin-bottom:4px">${esc(v.motivo)}</h3>
          <p class="modal-text">${formatoFecha(v.fecha)} · ${esc(v.autor)}</p>
          <div class="mini-tabla-wrap">
            <table class="mini-tabla">
              <thead><tr><th>#</th>${colsV.map((c) => `<th>${esc(c.titulo)}</th>`).join("")}</tr></thead>
              <tbody>
                ${filas.length === 0 ? `<tr><td colspan="${colsV.length + 1}">Sin filas</td></tr>` :
                  filas.map((f, n) => `<tr><td>${n + 1}</td>${colsV.map((c) => `<td>${esc(f[c.id] ?? "")}</td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
          </div>`, { grande: true });
      });

      item.querySelector(".restaurar-version")?.addEventListener("click", async () => {
        const ok = await confirmar(
          "Restaurar versión",
          `La planilla volverá al estado del ${formatoFecha(v.fecha)}. El estado actual se guardará en el historial antes de restaurar. (Los documentos no se modifican.)`,
          { textoOk: "Restaurar" }
        );
        if (!ok) return;
        try {
          clearTimeout(temporizadorGuardado);
          sesion.filas = leerFilas();
          await fotografiar("Antes de restaurar versión");
          sesion.filas = (v.filas || [filaVacia(colsV)]).map((f) => ({ ...f, _id: f._id || nuevoId() }));
          if (v.columnas && v.columnas.length) sesion.columnas = v.columnas.map((c) => ({ ...c }));
          normalizarSesion(sesion); // garantiza grupos válidos tras restaurar
          await actualizarSesion(sesion.id, { filas: sesion.filas, columnas: sesion.columnas, documentos: sesion.documentos });
          toast("Versión restaurada", "success");
          cerrar();
          render(contenedor, { user, parametro: sesion.id });
        } catch (err) {
          console.error(err);
          toast("No se pudo restaurar la versión", "error");
        }
      });
    });
  });

  // ══════════════════ FINALIZAR / REABRIR ══════════════════

  function pintarFinalizar() {
    const barra = contenedor.querySelector("#finalize-bar");

    if (sesion.estado === "finalizada") {
      barra.innerHTML = `
        <p class="finalize-info"><strong>Sesión finalizada.</strong> Si necesitas hacer cambios, puedes reabrirla.</p>
        <button class="btn btn-secondary" id="btn-reabrir">Reabrir sesión</button>`;
      barra.querySelector("#btn-reabrir").addEventListener("click", async () => {
        const ok = await confirmar("Reabrir sesión", "La sesión volverá al estado 'En proceso' y podrás editarla de nuevo.", { textoOk: "Reabrir" });
        if (!ok) return;
        await fotografiar("Sesión reabierta");
        await actualizarSesion(sesion.id, { estado: "en_proceso" });
        toast("Sesión reabierta", "success");
        render(contenedor, { user, parametro: sesion.id });
      });
      return;
    }

    sesion.filas = leerFilas();
    const incompletos = validarDocumentacion(sesion);
    const puedeFinalizar = incompletos.length === 0;

    barra.innerHTML = `
      <p class="finalize-info">
        ${puedeFinalizar
          ? (esCirugia
              ? `<strong>Todo listo.</strong> Los ${sesion.filas.length} paciente(s) tienen su documentación completa.`
              : `<strong>Sesión de consulta.</strong> Puedes finalizar cuando quieras; los documentos son opcionales.`)
          : `⚠️ No es posible finalizar: <strong>${incompletos.length} paciente(s)</strong> con documentación incompleta:
             ${incompletos.slice(0, 3).map((p) => `<strong>${esc(p.etiqueta)}</strong> (falta ${p.faltantes.join(" y ")})`).join(" · ")}${incompletos.length > 3 ? ` · y ${incompletos.length - 3} más…` : ""}`}
      </p>
      <button class="btn btn-primary" id="btn-finalizar" ${puedeFinalizar ? "" : "disabled"}>Finalizar sesión</button>`;

    barra.querySelector("#btn-finalizar").addEventListener("click", async () => {
      const pendientes = validarDocumentacion({ ...sesion, filas: leerFilas() });
      if (pendientes.length) {
        return toast(`No puedes finalizar: ${pendientes.length} paciente(s) sin documentación completa.`, "error");
      }
      const ok = await confirmar(
        "Finalizar sesión",
        "La planilla y los documentos quedarán en modo de solo lectura. Podrás reabrirla si lo necesitas.",
        { textoOk: "Finalizar" }
      );
      if (!ok) return;
      clearTimeout(temporizadorGuardado);
      sesion.filas = leerFilas();
      await fotografiar("Sesión finalizada");
      await actualizarSesion(sesion.id, { filas: sesion.filas, columnas: sesion.columnas, estado: "finalizada" });
      toast("Sesión finalizada 🎉", "success");
      render(contenedor, { user, parametro: sesion.id });
    });
  }

  pintarFinalizar();

  // ══════════════════ EDITAR NOMBRE DE LA SESIÓN ══════════════════
  contenedor.querySelector("#btn-editar-nombre")?.addEventListener("click", () => {
    const { cerrar, el } = abrirModal(`
      <h3>Editar nombre de la sesión</h3>
      <form id="form-nombre-sesion" novalidate>
        <div class="field">
          <label for="es-nombre">Nombre</label>
          <input type="text" id="es-nombre" maxlength="80" required value="${esc(sesion.nombre)}" />
        </div>
        <div class="field">
          <label for="es-desc">Descripción <span style="font-weight:400;color:var(--ink-soft)">(opcional)</span></label>
          <textarea id="es-desc" maxlength="220">${esc(sesion.descripcion || "")}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="es-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="es-guardar">Guardar</button>
        </div>
      </form>
    `);
    const input = el.querySelector("#es-nombre");
    input.focus(); input.select();
    el.querySelector("#es-cancelar").addEventListener("click", cerrar);

    el.querySelector("#form-nombre-sesion").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = input.value.trim();
      const descripcion = el.querySelector("#es-desc").value.trim();
      if (!nombre) return toast("El nombre no puede quedar vacío.", "error");

      const btn = el.querySelector("#es-guardar");
      btn.disabled = true;
      try {
        await renombrarSesion(sesion.id, nombre, descripcion);
        sesion.nombre = nombre;
        sesion.descripcion = descripcion;
        // Reflejo inmediato, sin recargar ni afectar pacientes/documentos
        contenedor.querySelector("#sesion-titulo").textContent = nombre;
        const sub = contenedor.querySelector(".view-head .view-sub");
        if (sub) sub.textContent = descripcion || ("Creada el " + formatoFecha(sesion.creadaEn));
        cerrar();
        toast("Nombre actualizado", "success");
      } catch (err) {
        console.error(err);
        toast("No se pudo actualizar el nombre", "error");
        btn.disabled = false;
      }
    });
  });
}
