# Notas de versión — GymApp

Registro formal de cambios entre versiones. La aplicación muestra estas mismas
notas en **Ajustes → Historial de versiones** (fuente:
`constants/patch-notes.ts`); ambos archivos deben mantenerse alineados al
publicar una versión.

> Versionado semántico: `MAYOR.MENOR.PARCHE`.
> `PARCHE` = correcciones · `MENOR` = funcionalidades nuevas compatibles.

---

## v1.2.0 — 2026-06-14

### Nuevas funcionalidades
- **Historial de versiones.** Nueva pantalla accesible desde Ajustes que recoge
  las notas de cada versión, organizadas en los apartados «Nuevas
  funcionalidades» y «Solución de errores». El contenido se centraliza en
  `constants/patch-notes.ts` y la versión más reciente queda destacada.

### Solución de errores
- Sin correcciones en esta versión.

---

## v1.1.0 — 2026-06-14

### Nuevas funcionalidades
- **Temporizador de descanso en vivo.** Durante el ejercicio activo, al
  confirmar una serie aparece un cronómetro (formato `M:SS`) que indica el
  tiempo transcurrido desde la última serie. Se calcula a partir de marcas de
  tiempo, sin procesos en segundo plano.
- **Confirmación visual al guardar.** Los botones de guardado de Ajustes (peso y
  notas) confirman la acción mediante una animación de color y un indicador de
  éxito.
- **Calendario con desplazamiento interactivo.** El arrastre sigue al dedo y
  muestra el mes adyacente en tiempo real; el cambio de mes se confirma
  únicamente al superar el umbral. Implementado con paginado nativo
  (`FlatList`) sobre meses reales (±10 años).
- **Rediseño visual del calendario.** Los días se representan como celdas
  redondeadas; las jornadas con entrenamiento se resaltan y el día actual se
  destaca con su número dentro de un círculo.
- **Un marcador por tipo de día.** Cuando una jornada incluye varios tipos de
  día, cada uno se muestra como un recuadro independiente, con un indicador
  «+N más» cuando no caben todos (calculado según el alto disponible).
- **Acceso directo en el detalle del día.** Si la jornada tiene un único tipo de
  día, se omite el nivel intermedio y se abren directamente sus ejercicios.
- **Diálogos con estilo propio.** Los avisos y confirmaciones adoptan el tema
  oscuro de la aplicación, en sustitución de los cuadros del sistema
  (`AlertProvider` propio y hook `useAlert()`).
- **Copia al portapapeles en Notas de desarrollo.** Nuevo botón para copiar el
  contenido de las notas, con su propia animación.
- **Catálogo de ejercicios plegable.** Con más de cinco ejercicios, el catálogo
  se contrae y se despliega mediante un control «Ver todos».
- **Autoría en Ajustes.** La pantalla de Ajustes muestra el crédito «Creado por
  jnm2231».

### Solución de errores
- **El teclado ya no oculta los campos de texto.** Al editar las notas de
  desarrollo o las repeticiones al final de la lista, la pantalla se desplaza
  para mantener el campo visible por encima del teclado.
- **Corregido el parpadeo del calendario al cambiar de mes.**
  - *Síntoma:* al terminar el swipe entre meses se veía durante un instante el
    mes anterior (o uno equivocado) antes de asentarse el nuevo.
  - *Causa:* el paginador propio tenía 3 paneles reciclados; el `setState` del
    mes nuevo (render asíncrono de React) y el recentrado del carril (hilo de
    UI) no quedaban sincronizados, colándose un fotograma con el mes incorrecto.
  - *Arreglo:* se eliminó el reciclado y se pasó a una `FlatList` horizontal con
    `pagingEnabled` y páginas de meses reales. Al no recolocarse nada, no existe
    fotograma intermedio que pueda parpadear.
- **Eliminados los destellos blancos en las transiciones de pantalla.**
  - *Síntoma:* al abrir el detalle de un día se veía un destello blanco lateral
    y, al volver atrás, un fotograma blanco a pantalla completa.
  - *Causa:* la vista raíz no tenía color de fondo, asomando la ventana nativa
    (blanca) durante las animaciones de navegación.
  - *Arreglo:* se fijó el fondo oscuro del tema en la vista raíz.
- **Navegación «atrás» coherente en el detalle del día.** El botón de retroceso
  respeta el nivel de navegación y vuelve a la lista de tipos de día cuando la
  jornada tiene varios; con un único tipo de día vuelve al calendario. Se
  resetean explícitamente `headerLeft`/`gestureEnabled` en el nivel 1, ya que
  `Stack.Screen` aplica las opciones con *merge*.
- **Corregido el parpadeo del histórico al cambiar de tipo de día.** Los
  ejercicios se cargan antes de cambiar de pantalla, evitando que se muestren
  brevemente los datos del tipo de día anterior.
- **Corregido el empaquetado para web.** Se añadió `metro.config.js` con soporte
  para `.wasm` y cabeceras COOP/COEP, necesarios para `expo-sqlite` en web (solo
  afectaba al bundle web, no al móvil).

---

## v1.0.0 — Primera versión

Primera versión funcional compilada como APK (perfil `preview`).

### Nuevas funcionalidades
- Registro de entrenamientos 100% local (SQLite), sin conexión ni cuenta.
- Días de entrenamiento configurables a partir de un catálogo de ejercicios.
- Sesión activa con peso global por ejercicio, series en línea y cálculo del
  descanso por marcas de tiempo; orden libre y posponer/añadir ejercicios.
- Calendario mensual con marcadores y navegación detallada por jornada.
- Histórico con gráfico de 1RM promedio y lista de registros.
- Ajustes: catálogo de ejercicios (flag corporal), peso del usuario, copias de
  seguridad (export/import `.json`, excluyendo notas) y notas de desarrollo.
