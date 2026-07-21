// ══════════════════════════════════════════════════════════
// BOE 2.0 — Capa de datos
// Firestore + Storage + reglas de negocio del dominio:
//   · Tipos de sesión: consulta (docs opcionales) / cirugia (docs obligatorios)
//   · Columnas dinámicas guardadas por sesión
//   · Documentos por paciente (fila) en dos grupos
//   · Historial de versiones
// ══════════════════════════════════════════════════════════

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// ---------- Identificadores ----------
export function nuevoId() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9));
}

// ---------- Tipos de sesión ----------
export const TIPOS_SESION = {
  consulta: { titulo: "Consulta", descripcion: "Los documentos son opcionales. Puedes finalizar sin adjuntar archivos." },
  cirugia:  { titulo: "Cirugía",  descripcion: "Cada paciente debe tener su documentación completa para poder finalizar." }
};

// ---------- Grupos documentales ----------
export const GRUPOS_DOC = [
  { id: "informes",       titulo: "Informes Quirúrgicos" },
  { id: "autorizaciones", titulo: "Autorizaciones" }
];

// ---------- Plantilla inicial de columnas ----------
// Es solo el punto de partida: el usuario puede crear, renombrar,
// mover, ocultar y eliminar columnas desde la propia planilla.
export const COLUMNAS_PLANTILLA = () => [
  { id: nuevoId(), titulo: "Paciente",      tipo: "text",   visible: true },
  { id: nuevoId(), titulo: "Documento",     tipo: "text",   visible: true },
  { id: nuevoId(), titulo: "Procedimiento", tipo: "text",   visible: true },
  { id: nuevoId(), titulo: "Valor",         tipo: "number", visible: true },
  { id: nuevoId(), titulo: "Observaciones", tipo: "text",   visible: true }
];

export function filaVacia(columnas) {
  const fila = { _id: nuevoId() };
  (columnas || []).forEach((c) => (fila[c.id] = ""));
  return fila;
}

// ---------- Normalización / migración ----------
// Garantiza que una sesión (incluso creada con versiones anteriores
// del sistema) tenga la estructura actual sin perder información.
export function normalizarSesion(sesion) {
  let cambio = false;

  if (!sesion.tipo) { sesion.tipo = "cirugia"; cambio = true; }

  if (!Array.isArray(sesion.columnas) || sesion.columnas.length === 0) {
    sesion.columnas = COLUMNAS_PLANTILLA();
    cambio = true;
  }
  sesion.columnas.forEach((c) => {
    if (c.visible === undefined) { c.visible = true; cambio = true; }
  });

  if (!Array.isArray(sesion.filas) || sesion.filas.length === 0) {
    sesion.filas = [filaVacia(sesion.columnas)];
    cambio = true;
  }
  sesion.filas.forEach((f) => {
    if (!f._id) { f._id = nuevoId(); cambio = true; }
  });

  // Migrar el formato antiguo de documentos (doc1/doc2 por sesión)
  // al nuevo formato por paciente, sin perder los archivos.
  if (sesion.documentos && (sesion.documentos.doc1 !== undefined || sesion.documentos.doc2 !== undefined)) {
    const viejo = sesion.documentos;
    const primeraFila = sesion.filas[0]._id;
    sesion.documentos = { [primeraFila]: { informes: [], autorizaciones: [] } };
    if (viejo.doc1) sesion.documentos[primeraFila].informes.push(viejo.doc1);
    if (viejo.doc2) sesion.documentos[primeraFila].autorizaciones.push(viejo.doc2);
    cambio = true;
  }
  if (!sesion.documentos || typeof sesion.documentos !== "object") {
    sesion.documentos = {};
    cambio = true;
  }

  // Migración a grupos documentales: cada fila debe tener _grupo.
  // Si sus documentos estaban guardados bajo su propio _id (formato
  // anterior), ese mismo ID se convierte en su grupo: nada se pierde.
  sesion.filas.forEach((f) => {
    if (!f._grupo) {
      f._grupo = sesion.documentos[f._id] ? f._id : nuevoId();
      cambio = true;
    }
    if (!sesion.documentos[f._grupo]) {
      sesion.documentos[f._grupo] = grupoVacio();
      cambio = true;
    }
  });

  return cambio;
}

// ---------- Grupos documentales (arquitectura por referencias) ----------
// Cada fila guarda en _grupo el ID de su grupo documental. Varias filas
// pueden apuntar al mismo grupo: comparten exactamente los mismos archivos.

export function grupoVacio() {
  return Object.fromEntries(GRUPOS_DOC.map((g) => [g.id, []]));
}

export function docsDeGrupo(sesion, gid) {
  const d = (gid && sesion.documentos?.[gid]) || {};
  return {
    informes: Array.isArray(d.informes) ? d.informes : [],
    autorizaciones: Array.isArray(d.autorizaciones) ? d.autorizaciones : []
  };
}

// Documentación de un paciente = la de su grupo
export function docsDePaciente(sesion, filaId) {
  const fila = (sesion.filas || []).find((f) => f._id === filaId);
  return docsDeGrupo(sesion, fila?._grupo);
}

export function miembrosDeGrupo(sesion, gid) {
  return (sesion.filas || []).filter((f) => f._grupo === gid);
}

// Etiqueta legible del paciente: valor de la primera columna visible
export function etiquetaPaciente(sesion, fila, posicion) {
  const col = sesion.columnas.find((c) => c.visible !== false) || sesion.columnas[0];
  const valor = col ? String(fila[col.id] ?? "").trim() : "";
  return valor || `Fila ${posicion}`;
}

// ---------- Validación automática (sesiones de cirugía) ----------
// Devuelve la lista de pacientes con documentación incompleta.
export function validarDocumentacion(sesion) {
  if (sesion.tipo !== "cirugia") return [];
  return sesion.filas
    .map((fila, i) => {
      const docs = docsDePaciente(sesion, fila._id);
      const faltantes = GRUPOS_DOC.filter((g) => docs[g.id].length === 0).map((g) => g.titulo);
      return faltantes.length
        ? { filaId: fila._id, etiqueta: etiquetaPaciente(sesion, fila, i + 1), faltantes }
        : null;
    })
    .filter(Boolean);
}

// Conteo de pacientes con documentación completa (para tarjetas)
export function pacientesCompletos(sesion) {
  const total = (sesion.filas || []).length;
  if (sesion.tipo !== "cirugia") return { total, completos: total };
  const completos = (sesion.filas || []).filter((f) => {
    const d = docsDePaciente(sesion, f._id);
    return GRUPOS_DOC.every((g) => d[g.id].length > 0);
  }).length;
  return { total, completos };
}

// ══════════ SESIONES ══════════

const col = () => collection(db, "sesiones");

export const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export async function crearSesion(uid, { nombre, descripcion, tipo, carpetaId, mes, anio }) {
  const columnas = COLUMNAS_PLANTILLA();
  const primeraFila = filaVacia(columnas);
  primeraFila._grupo = nuevoId();
  const ahora = new Date();
  const refDoc = await addDoc(col(), {
    uid,
    nombre,
    descripcion: descripcion || "",
    tipo: tipo === "consulta" ? "consulta" : "cirugia",
    carpetaId: carpetaId || null,
    mes: Number.isInteger(mes) ? mes : ahora.getMonth(),   // 0-11
    anio: anio || ahora.getFullYear(),
    estado: "en_proceso",
    columnas,
    filas: [primeraFila],
    documentos: { [primeraFila._grupo]: grupoVacio() },
    creadaEn: serverTimestamp(),
    actualizadaEn: serverTimestamp()
  });
  return refDoc.id;
}

export async function listarSesiones(uid) {
  const snap = await getDocs(query(col(), where("uid", "==", uid)));
  const sesiones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  sesiones.sort((a, b) => (b.actualizadaEn?.seconds || 0) - (a.actualizadaEn?.seconds || 0));
  return sesiones;
}

export async function obtenerSesion(id) {
  const snap = await getDoc(doc(db, "sesiones", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function actualizarSesion(id, datos) {
  await updateDoc(doc(db, "sesiones", id), { ...datos, actualizadaEn: serverTimestamp() });
}

// Eliminar sesión + todos sus archivos en Storage
export async function renombrarSesion(id, nombre, descripcion) {
  const datos = { nombre };
  if (descripcion !== undefined) datos.descripcion = descripcion;
  await updateDoc(doc(db, "sesiones", id), { ...datos, actualizadaEn: serverTimestamp() });
}

// Copiar SOLO la estructura de una sesión a otro mes (plantilla vacía):
// nombre, tipo y columnas; sin pacientes, sin documentos, sin archivos.
export async function copiarEstructuraSesion(uid, sesion, { nombre, mes, anio, carpetaId }) {
  const columnas = (sesion.columnas || COLUMNAS_PLANTILLA()).map((c) => ({
    id: nuevoId(),          // ids nuevos: independiente de la original
    titulo: c.titulo,
    tipo: c.tipo || "text",
    visible: c.visible !== false,
    ...(c.width ? { width: c.width } : {})
  }));
  const primeraFila = { _id: nuevoId(), _grupo: nuevoId() };
  columnas.forEach((c) => (primeraFila[c.id] = ""));

  const refDoc = await addDoc(col(), {
    uid,
    nombre,
    descripcion: sesion.descripcion || "",
    tipo: sesion.tipo || "cirugia",
    carpetaId: carpetaId ?? sesion.carpetaId ?? null,
    mes: Number.isInteger(mes) ? mes : sesion.mes ?? new Date().getMonth(),
    anio: anio || sesion.anio || new Date().getFullYear(),
    estado: "en_proceso",
    columnas,
    filas: [primeraFila],
    documentos: { [primeraFila._grupo]: grupoVacio() },
    creadaEn: serverTimestamp(),
    actualizadaEn: serverTimestamp()
  });
  return refDoc.id;
}

export async function moverSesionAMes(sesionId, mes, anio) {
  await updateDoc(doc(db, "sesiones", sesionId), { mes, anio, actualizadaEn: serverTimestamp() });
}

export async function eliminarSesion(sesion) {
  const docs = sesion.documentos || {};
  const rutasBorradas = new Set();
  for (const gid of Object.keys(docs)) {
    for (const grupo of GRUPOS_DOC) {
      for (const archivo of docs[gid]?.[grupo.id] || []) {
        if (archivo?.path && rutasBorradas.has(archivo.path)) continue;
        if (archivo?.path) rutasBorradas.add(archivo.path);
        if (archivo?.path) {
          try { await deleteObject(ref(storage, archivo.path)); }
          catch (e) { console.warn("Archivo ya no existía:", e.code); }
        }
      }
    }
  }
  // Compatibilidad con el formato antiguo
  for (const slot of ["doc1", "doc2"]) {
    if (docs[slot]?.path) {
      try { await deleteObject(ref(storage, docs[slot].path)); } catch (e) {}
    }
  }
  await deleteDoc(doc(db, "sesiones", sesion.id));
}

// ══════════ ARCHIVOS (Storage) ══════════

export const MAX_MB = 10;
export const TIPOS_PERMITIDOS = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];

export function validarArchivo(file) {
  if (!TIPOS_PERMITIDOS.includes(file.type))
    return "Formato no permitido. Usa PDF, PNG, JPG, JPEG o WEBP.";
  if (file.size > MAX_MB * 1024 * 1024)
    return `"${file.name}" supera el máximo de ${MAX_MB} MB.`;
  return null;
}

export function subirArchivo(uid, sesionId, filaId, grupoId, file, onProgreso) {
  return new Promise((resolve, reject) => {
    const extension = file.name.split(".").pop().toLowerCase();
    const path = `usuarios/${uid}/sesiones/${sesionId}/${filaId}/${grupoId}_${Date.now()}.${extension}`;
    const tarea = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    tarea.on(
      "state_changed",
      (s) => onProgreso(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(tarea.snapshot.ref);
        resolve({
          id: nuevoId(),
          nombre: file.name,
          tamano: file.size,
          tipo: file.type,
          fechaCarga: Date.now(),
          url,
          path
        });
      }
    );
  });
}

export async function eliminarArchivo(path) {
  try { await deleteObject(ref(storage, path)); }
  catch (e) { console.warn("Archivo ya no existía:", e.code); }
}

// ══════════ HISTORIAL DE VERSIONES ══════════

const colVersiones = (sesionId) => collection(db, "sesiones", sesionId, "versiones");

export async function guardarVersion(sesionId, { autor, motivo, filas, columnas, documentos }) {
  let totalArchivos = 0;
  Object.values(documentos || {}).forEach((porFila) => {
    GRUPOS_DOC.forEach((g) => (totalArchivos += (porFila?.[g.id] || []).length));
  });
  await addDoc(colVersiones(sesionId), {
    autor: autor || "Usuario",
    motivo: motivo || "Cambio",
    filas: filas || [],
    columnas: columnas || [],
    totalArchivos,
    fecha: serverTimestamp()
  });
}

export async function listarVersiones(sesionId) {
  const snap = await getDocs(colVersiones(sesionId));
  const versiones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  versiones.sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));
  return versiones;
}

// ══════════ PERFIL ══════════

export async function obtenerPerfil(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function actualizarPerfil(uid, datos) {
  await updateDoc(doc(db, "users", uid), datos);
}

export function subirFotoPerfil(uid, file, onProgreso) {
  return new Promise((resolve, reject) => {
    const path = `usuarios/${uid}/perfil/foto_${Date.now()}`;
    const tarea = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    tarea.on(
      "state_changed",
      (s) => onProgreso(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => resolve({ url: await getDownloadURL(tarea.snapshot.ref), path })
    );
  });
}

// ══════════ CARPETAS (contenedores de sesiones) ══════════

const colCarpetas = () => collection(db, "carpetas");

export async function crearCarpeta(uid, { nombre, color, descripcion, logoURL, logoPath, general = false }) {
  const refDoc = await addDoc(colCarpetas(), {
    uid,
    nombre,
    logoURL: logoURL || null,
    logoPath: logoPath || null,
    color: color || "",
    descripcion: descripcion || "",
    general: !!general,
    creadaEn: serverTimestamp(),
    actualizadaEn: serverTimestamp()
  });
  return refDoc.id;
}

export async function listarCarpetas(uid) {
  const snap = await getDocs(query(colCarpetas(), where("uid", "==", uid)));
  const carpetas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // La carpeta General siempre primero, el resto por antigüedad
  carpetas.sort((a, b) => {
    if (a.general !== b.general) return a.general ? -1 : 1;
    return (a.creadaEn?.seconds || 0) - (b.creadaEn?.seconds || 0);
  });
  return carpetas;
}

export async function actualizarCarpeta(id, datos) {
  await updateDoc(doc(db, "carpetas", id), { ...datos, actualizadaEn: serverTimestamp() });
}

export async function eliminarCarpetaDoc(id) {
  await deleteDoc(doc(db, "carpetas", id));
}

// Garantiza que exista la carpeta "General" del usuario y la devuelve.
export async function asegurarCarpetaGeneral(uid, carpetas = null) {
  const lista = carpetas || (await listarCarpetas(uid));
  const general = lista.find((c) => c.general);
  if (general) return general;
  const id = await crearCarpeta(uid, { nombre: "General", general: true });
  return { id, uid, nombre: "General", logoURL: null, logoPath: null, color: "", descripcion: "", general: true };
}

export async function moverSesionACarpeta(sesionId, carpetaId) {
  await updateDoc(doc(db, "sesiones", sesionId), { carpetaId, actualizadaEn: serverTimestamp() });
}

// Logo de carpeta (imagen personalizada)
export function subirLogoCarpeta(uid, file, onProgreso = () => {}) {
  return new Promise((resolve, reject) => {
    const path = `usuarios/${uid}/carpetas/logo_${Date.now()}.webp`;
    const tarea = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    tarea.on(
      "state_changed",
      (s) => onProgreso(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => resolve({ url: await getDownloadURL(tarea.snapshot.ref), path })
    );
  });
}
