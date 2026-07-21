# BOE 2.0 — Sistema completo (SPA)

Aplicación de una sola página (Single Page Application): `index.html` es la
única página. Las pantallas (splash, login, aplicación) se reemplazan
completamente entre sí — nunca se apilan.

## Estructura

```
index.html            → Única página (splash + auth + app)
firestore.rules       → Reglas de Firestore  (pegar en la consola)
storage.rules         → Reglas de Storage    (pegar en la consola)
assets/favicon.svg
css/
  base.css            → Tokens, componentes, modo oscuro
  auth.css            → Splash + autenticación
  app.css             → Shell, módulos, planilla, documentos, perfil
js/
  firebase-config.js  → Conexión a Firebase
  main.js             → Orquestador: pantallas, sesión, tema, menú
  auth.js             → Login / registro / recuperar contraseña
  router.js           → Navegación #/dashboard · #/sesiones/{id} · #/perfil
  datos.js            → Capa de datos (Firestore + Storage + versiones)
  utils/ui.js         → Toasts, modales, tema, formatos
  modules/
    dashboard.js      → Resumen, estadísticas, recientes
    sesiones.js       → Lista + crear + eliminar sesiones
    sesion-detalle.js → Planilla Excel + documentos + historial + finalizar
    perfil.js         → Foto, nombre, contraseña, preferencias
```

## Puesta en marcha (2 pasos en la consola de Firebase)

1. **Firestore Database → Reglas** → pegar `firestore.rules` → Publicar.
2. **Storage → Reglas** → pegar `storage.rules` → Publicar.

## Ejecución local

VS Code → extensión **Live Server** → clic derecho en `index.html` →
*Open with Live Server*. (Los módulos JS no funcionan con doble clic.)

## Despliegue en Vercel

- Subir todo el contenido a la raíz del repositorio (`git add -A`).
- En Firebase: **Authentication → Settings → Dominios autorizados** →
  agregar el dominio `*.vercel.app` asignado.

## Personalizar las columnas de la planilla

Editar únicamente la constante `COLUMNAS` al inicio de `js/datos.js`.

## Lista de pruebas

- [ ] Splash al abrir → luego SOLO login (nunca apilado con el dashboard).
- [ ] Registro, login, recuperar contraseña, recordar sesión, mostrar/ocultar.
- [ ] Al iniciar sesión: splash animado → dashboard.
- [ ] Cerrar sesión → SOLO login.
- [ ] Modo oscuro: botón en topbar y switch en perfil; se recuerda.
- [ ] Crear sesión → abre su detalle.
- [ ] Planilla: doble clic edita; Ctrl+C/Ctrl+V (incluso desde Excel);
      selección de rangos; ordenar; filtrar por columna; buscar; redimensionar
      columnas; clic derecho inserta/elimina filas; arrastrar ⠿ reordena;
      indicador "Guardando… / Todo guardado".
- [ ] Documentos: arrastrar y soltar; barra y % de progreso; miniatura de
      imágenes; ver/descargar/reemplazar/eliminar; formatos y 10 MB validados.
- [ ] Finalizar bloqueado hasta 2/2 documentos, con mensaje de cuál falta.
- [ ] Finalizada → solo lectura → reabrir funciona.
- [ ] Historial: versiones con fecha/autor/motivo; ver contenido; restaurar.
- [ ] Perfil: foto, nombre (se refleja en el sidebar), contraseña con
      verificación de la actual, fechas de creación y último acceso.
- [ ] Responsive en celular: menú deslizante, planilla con scroll.
