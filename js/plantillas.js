// ══════════════════════════════════════════════════════════
// BOE 2.0 — Sistema de Plantillas
//
// Una plantilla es un OBJETO DE CONFIGURACIÓN autónomo que
// describe la ESTRUCTURA (carpeta → meses → sesiones → columnas
// → configuración), SIN ningún dato de pacientes ni documentos.
//
//   Plantilla
//     ├─ carpeta:  { nombre, logoURL, color, descripcion }
//     └─ sesiones: [ { nombre, tipo, mes, anio, columnas[] } ]
//
// Portabilidad: se guarda en la Biblioteca (nube, por usuario)
// y se puede exportar/importar como archivo .boe.json para
// transferir la estructura entre cuentas sin compartir datos.
// Al importar SIEMPRE se generan IDs nuevos.
// ══════════════════════════════════════════════════════════

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, getDocs, deleteDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import {
  nuevoId, listarSesiones, crearCarpeta, crearSesion, actualizarSesion,
  subirLogoCarpeta, grupoVacio
} from "./datos.js";

export const PLANTILLA_VERSION = 1;
const colPlantillas = () => collection(db, "plantillas");

// ---------- Solo la configuración de columnas (sin datos) ----------
function columnasLimpias(columnas = []) {
  return columnas.map((c) => ({
    titulo: c.titulo,
    tipo: c.tipo || "text",
    visible: c.visible !== false,
    obligatoria: !!c.obligatoria,
    ...(c.width ? { width: c.width } : {})
  }));
}

// ══════════ CONSTRUIR una plantilla desde una carpeta ══════════
// Toma la estructura viva y produce el objeto de plantilla limpio.
export async function construirPlantillaDesdeCarpeta(uid, carpeta) {
  const todas = await listarSesiones(uid);
  const sesiones = todas
    .filter((s) => s.carpetaId === carpeta.id)
    .sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes))
    .map((s) => ({
      nombre: s.nombre,
      tipo: s.tipo || "cirugia",
      mes: Number.isInteger(s.mes) ? s.mes : 0,
      anio: s.anio || new Date().getFullYear(),
      descripcion: s.descripcion || "",
      columnas: columnasLimpias(s.columnas)
    }));

  return {
    _tipo: "boe-plantilla",
    version: PLANTILLA_VERSION,
    generada: new Date().toISOString(),
    carpeta: {
      nombre: carpeta.nombre,
      logoURL: carpeta.logoURL || null,
      color: carpeta.color || "",
      descripcion: carpeta.descripcion || ""
    },
    sesiones
  };
}

// ══════════ BIBLIOTECA (nube, por usuario) ══════════

export async function guardarEnBiblioteca(uid, plantilla, nombrePlantilla) {
  const refDoc = await addDoc(colPlantillas(), {
    uid,
    nombre: nombrePlantilla || plantilla.carpeta.nombre,
    datos: plantilla,
    totalSesiones: plantilla.sesiones.length,
    creadaEn: serverTimestamp()
  });
  return refDoc.id;
}

export async function listarBiblioteca(uid) {
  const snap = await getDocs(query(colPlantillas(), where("uid", "==", uid)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.creadaEn?.seconds || 0) - (a.creadaEn?.seconds || 0));
  return items;
}

export async function eliminarDeBiblioteca(id) {
  await deleteDoc(doc(db, "plantillas", id));
}

// ══════════ EXPORTAR como archivo .boe.json ══════════

export function descargarPlantilla(plantilla) {
  const nombre = (plantilla.carpeta.nombre || "plantilla")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const blob = new Blob([JSON.stringify(plantilla, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre || "plantilla"}.boe.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ══════════ LEER y VALIDAR una plantilla desde archivo ══════════

export function leerPlantillaDesdeArchivo(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const obj = JSON.parse(lector.result);
        const error = validarPlantilla(obj);
        if (error) return reject(new Error(error));
        resolve(obj);
      } catch (e) {
        reject(new Error("El archivo no es una plantilla válida (no se pudo leer el JSON)."));
      }
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsText(file);
  });
}

export function validarPlantilla(obj) {
  if (!obj || obj._tipo !== "boe-plantilla") return "Este archivo no es una plantilla de BOE 2.0.";
  if (!obj.carpeta || typeof obj.carpeta.nombre !== "string") return "La plantilla no tiene una carpeta válida.";
  if (!Array.isArray(obj.sesiones)) return "La plantilla no tiene sesiones válidas.";
  if (obj.version > PLANTILLA_VERSION) return "La plantilla fue creada con una versión más nueva del sistema.";
  return null;
}

// ══════════ IMPORTAR: materializar la estructura con IDs NUEVOS ══════════
// Crea carpeta + sesiones vacías. onProgreso(texto) informa el avance.
export async function importarPlantilla(uid, plantilla, onProgreso = () => {}) {
  // 1) Logo: cada usuario obtiene su PROPIA copia del archivo
  let logoURL = null, logoPath = null;
  if (plantilla.carpeta.logoURL) {
    try {
      onProgreso("Copiando el logo…");
      const resp = await fetch(plantilla.carpeta.logoURL);
      const blob = await resp.blob();
      const file = new File([blob], "logo.webp", { type: blob.type || "image/webp" });
      const subido = await subirLogoNuevoUsuario(uid, file);
      logoURL = subido.url; logoPath = subido.path;
    } catch (e) {
      console.warn("No se pudo copiar el logo de la plantilla:", e);
    }
  }

  // 2) Carpeta con ID nuevo
  onProgreso("Creando la carpeta…");
  const carpetaId = await crearCarpeta(uid, {
    nombre: plantilla.carpeta.nombre,
    color: plantilla.carpeta.color || "",
    descripcion: plantilla.carpeta.descripcion || "",
    logoURL, logoPath
  });

  // 3) Cada sesión: creada vacía y luego se le aplican sus columnas
  //    (con IDs de columna NUEVOS). Sin pacientes ni documentos.
  let hechas = 0;
  for (const s of plantilla.sesiones) {
    onProgreso(`Creando sesiones… (${hechas + 1}/${plantilla.sesiones.length})`);

    const sesionId = await crearSesion(uid, {
      nombre: s.nombre,
      descripcion: s.descripcion || "",
      tipo: s.tipo === "consulta" ? "consulta" : "cirugia",
      carpetaId,
      mes: Number.isInteger(s.mes) ? s.mes : 0,
      anio: s.anio || new Date().getFullYear()
    });

    // Columnas con IDs nuevos + fila vacía inicial coherente
    const columnas = (s.columnas || []).map((c) => ({
      id: nuevoId(),
      titulo: c.titulo,
      tipo: c.tipo || "text",
      visible: c.visible !== false,
      obligatoria: !!c.obligatoria,
      ...(c.width ? { width: c.width } : {})
    }));

    if (columnas.length) {
      const grupo = nuevoId();
      const primeraFila = { _id: nuevoId(), _grupo: grupo };
      columnas.forEach((c) => (primeraFila[c.id] = ""));
      await actualizarSesion(sesionId, {
        columnas,
        filas: [primeraFila],
        documentos: { [grupo]: grupoVacio() }
      });
    }
    hechas++;
  }

  onProgreso("¡Listo!");
  return { carpetaId, totalSesiones: plantilla.sesiones.length };
}

// El logo importado se guarda en el espacio del usuario que importa
function subirLogoNuevoUsuario(uid, file) {
  return new Promise((resolve, reject) => {
    const path = `usuarios/${uid}/carpetas/logo_${Date.now()}.webp`;
    const tarea = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    tarea.on("state_changed", null, reject,
      async () => resolve({ url: await getDownloadURL(tarea.snapshot.ref), path }));
  });
}
