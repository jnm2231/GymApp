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
- **Calendario: swipe interactivo.** El arrastre sigue al dedo mostrando el mes
  adyacente en tiempo real; si no se supera el umbral (o se mantiene el dedo), el
  mes vuelve a su sitio sin cambiar. Implementado con paginado nativo
  (`FlatList`), con meses reales (±10 años) que se deslizan junto al mes actual.
- **Calendario: rediseño visual.** Cada día es ahora una celda redondeada tipo
  «tile» con su propia separación, los días con entreno se tiñen sutilmente y el
  día de hoy se resalta con el número dentro de un círculo naranja.
- **Calendario: un recuadro por tipo de día.** Si un día tiene varios tipos de
  día (p. ej. Pecho y Espalda), se muestran como recuadros separados. El
  «+N más» aparece solo cuando ya no caben más en la celda (se calcula según el
  alto disponible).
- **Detalle del día: acceso directo si solo hay un tipo de día.** Al pulsar un
  día del calendario con un único tipo de día, se salta el nivel intermedio y se
  abren directamente sus ejercicios.

### 🐛 Correcciones / mejoras de usabilidad
- **El teclado ya no tapa los campos de texto.** Al escribir las notas de
  desarrollo (Ajustes) o las repeticiones de un ejercicio al final de la lista,
  la pantalla se desplaza automáticamente para mantener el campo visible por
  encima del teclado.
- **Arreglado el empaquetado web.** Se añadió `metro.config.js` con soporte para
  `.wasm` y cabeceras COOP/COEP, necesarios para `expo-sqlite` en web. El error
  «Unable to resolve module ./wa-sqlite/wa-sqlite.wasm» ya no aparece (solo
  afectaba al bundle web, no al móvil).
- **Arreglado el "flashazo" del calendario al cambiar de mes.**
  - *Síntoma:* al terminar el swipe entre meses, durante una fracción de segundo
    se veía centrado el mes anterior (o un mes equivocado) antes de asentarse el
    nuevo.
  - *Causa:* el pager casero tenía 3 paneles `[anterior][actual][siguiente]` que
    se **reciclaban**: al confirmar el cambio se hacían a la vez el `setState`
    del mes nuevo (re-render **asíncrono** de React) y el recentrado del carril
    (`translateX`, en el hilo de UI). En React Native el render cruza el puente
    de forma asíncrona, así que ese recentrado nunca queda perfectamente
    sincronizado con el repintado nativo y se colaba un frame con el mes
    incorrecto centrado. Un primer intento con `useLayoutEffect` redujo el flash
    pero no lo eliminó (la sincronía JS↔UI sigue sin estar garantizada).
  - *Arreglo:* se eliminó el reciclado de paneles. El calendario pasa a usar una
    **`FlatList` horizontal con `pagingEnabled`** y páginas de meses **reales**
    (±10 años). El paginado, el arrastre que sigue al dedo y el *snap* (volver si
    no se pasa la mitad) los hace el sistema de forma nativa, y como ya **no se
    recoloca nada**, no existe ningún frame intermedio que pueda parpadear. Los
    meses cargan sus sesiones de forma incremental al desplazarse y se acumulan
    en memoria. La ventana de meses está anclada al mes real actual (no a la
    fecha de instalación), así que se desliza con el tiempo y nunca «se acaba».
- **Arreglado el flash blanco en las transiciones de pantalla.**
  - *Síntoma:* al abrir el detalle de un día se veía un destello blanco en un
    lateral, y al volver atrás un frame blanco a pantalla completa.
  - *Causa:* la vista raíz (`GestureHandlerRootView` / `SafeAreaProvider`) no
    tenía color de fondo, así que durante las animaciones de navegación se
    asomaba por un frame la ventana nativa (blanca por defecto).
  - *Arreglo:* se fijó el fondo oscuro del tema en la vista raíz, de modo que
    cualquier hueco transitorio durante las transiciones se ve oscuro.
- **Detalle del día: el botón «atrás» respeta el nivel de navegación.**
  - *Síntoma:* dentro de un tipo de día (nivel 2), la flecha del header llevaba
    directamente al calendario en vez de volver a la lista de tipos de día.
  - *Causa:* los niveles 1 (tipos de día) y 2 (ejercicios) viven en la misma
    ruta con estado interno; la flecha nativa hacía `pop` de toda la ruta.
  - *Arreglo:* cuando la jornada tiene varios tipos de día, el «atrás» (flecha
    del header y botón físico de Android) vuelve primero al nivel 1. Si solo hay
    un tipo de día (acceso directo), el «atrás» va al calendario como toca.
  - *Apunte (segundo arreglo):* `Stack.Screen` aplica las opciones con *merge*,
    así que al volver del nivel 2 al nivel 1 se conservaba el `headerLeft`
    personalizado y la flecha del nivel 1 dejaba de llevar al calendario. Se
    resetean explícitamente `headerLeft`/`gestureEnabled` en el nivel 1.

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
