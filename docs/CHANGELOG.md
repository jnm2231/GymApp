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

### 🐛 Correcciones / mejoras de usabilidad
- **El teclado ya no tapa los campos de texto.** Al escribir las notas de
  desarrollo (Ajustes) o las repeticiones de un ejercicio al final de la lista,
  la pantalla se desplaza automáticamente para mantener el campo visible por
  encima del teclado.

### 🔜 Pendiente en esta versión (siguiente tanda)
- Feedback visual al guardar en Ajustes (botón → verde + tick animado).
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
