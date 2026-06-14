# Patch notes — GymApp

Registro de cambios entre versiones. Útil para redactar las notas de la versión
que se publica en cada APK.

> Versionado semántico: `MAYOR.MENOR.PARCHE`.
> `PARCHE` = correcciones · `MENOR` = funcionalidades nuevas compatibles.

---

## v1.1.0 — (en desarrollo)

### ✨ Nuevo
- **Temporizador de descanso en vivo.** En el ejercicio activo, tras confirmar
  una serie aparece un cronómetro (`M:SS`) que cuenta el tiempo transcurrido
  desde la última serie, para controlar el descanso de un vistazo. No corre en
  segundo plano: se calcula a partir de la marca de tiempo de la última serie.
- **Feedback animado al guardar.** Los botones «Guardar» de Ajustes (peso y
  notas) confirman la acción con una animación: el botón se tiñe de verde y
  vuelve progresivamente a su color mientras un tick aparece, brilla y se
  desvanece «explotando».
- **Autoría en Ajustes.** El pie de la pantalla de Ajustes muestra
  «Creado por jnm2231».

### 🐛 Correcciones / mejoras de usabilidad
- **El teclado ya no tapa los campos de texto.** Al escribir las notas de
  desarrollo (Ajustes) o las repeticiones de un ejercicio al final de la lista,
  la pantalla se desplaza automáticamente para mantener el campo visible por
  encima del teclado.
- **Arreglado el empaquetado web.** Se añadió `metro.config.js` con soporte para
  `.wasm` y cabeceras COOP/COEP, necesarios para `expo-sqlite` en web. El error
  «Unable to resolve module ./wa-sqlite/wa-sqlite.wasm» ya no aparece (solo
  afectaba al bundle web, no al móvil).

### 🔜 Pendiente en esta versión (siguiente tanda)
- Swipe del calendario más suave (arrastre que sigue al dedo, sin saltos bruscos).
- Rediseño estético del calendario (bordes/celdas más cuidadas).

---

## v1.0.0 — Primera versión

Primera versión funcional compilada como APK (perfil `preview`).

- Registro de entrenamientos 100% local (SQLite), sin conexión ni cuenta.
- Días de entrenamiento configurables a partir de un catálogo de ejercicios.
- Sesión activa con peso global por ejercicio, series inline y cálculo del
  descanso por marcas de tiempo; orden libre y posponer/añadir ejercicios.
- Calendario mensual con marcadores y drill-down por jornada.
- Histórico con gráfico de 1RM promedio y lista de registros.
- Ajustes: catálogo de ejercicios (flag corporal), peso del usuario, copias de
  seguridad (export/import `.json`, excluyendo notas) y notas de desarrollo.
