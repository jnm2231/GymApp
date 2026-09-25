# Notas de versión — GymApp

Registro formal de cambios entre versiones. La aplicación muestra estas mismas
notas en **Ajustes → Historial de versiones** (fuente:
`constants/patch-notes.ts`); ambos archivos deben mantenerse alineados al
publicar una versión.

> Versionado semántico: `MAYOR.MENOR.PARCHE`.
> `PARCHE` = correcciones · `MENOR` = funcionalidades nuevas compatibles.

---

## v1.3.0 — 2026-09-20

### Nuevas funcionalidades
- **Duración media y fin estimado.** Al comenzar un entrenamiento se muestra la
  duración media de las últimas 20 sesiones finalizadas de ese mismo día y la
  hora estimada de finalización. El cálculo usa como final real la última serie.
- **Recordatorio para finalizar el entrenamiento.** Si pasan 30 minutos sin
  actividad, una notificación permite finalizar la sesión o indicar que se
  continúa entrenando.
- **Histórico global de ejercicios.** La pestaña Histórico muestra todos los
  ejercicios realizados, excluye los que nunca se han entrenado y permite
  ordenarlos por nombre, número de veces realizado o mejor 1RM. Cada histórico
  individual indica también cuántas veces se realizó el ejercicio. Un selector
  permite cambiar a una vista por días, donde cada plantilla es desplegable.
- **Registro corporal.** Personal permite registrar peso con histórico, altura y
  fecha de nacimiento, calculando la edad automáticamente. El usuario elige el
  día semanal de pesaje y activa el aviso desde Notificaciones. Los datos se
  muestran en modo lectura y los campos solo aparecen al registrar o editar.
  - *Modelo de datos:* nueva tabla `body_measurements` y esquema v3.
- **Días de musculación, cardio y calistenia.** Las plantillas y sus sesiones se
  clasifican por tipo y se distinguen por color: musculación en naranja, cardio
  en azul y calistenia en verde. Aguante permanece como tipo de ejercicio, pero
  deja de ser un tipo de día. Los
  ejercicios de Cardio cronometran siempre el tiempo; la distancia es opcional
  y, cuando se indica, la aplicación calcula el ritmo medio. Los resultados y
  notas aparecen en el calendario y el histórico.
  - *Modelo de datos:* los antiguos días de Aguante se migran a Calistenia en el
    esquema v8, conservando intactos sus ejercicios y sesiones.
  - *Modelo de datos:* tipos fotografiados en plantillas y sesiones, nueva tabla
    `cardio_entries` y esquema v4.
- **Días con ejercicios de cualquier tipo.** Una misma plantilla puede mezclar
  ejercicios de musculación, cardio, corporal y aguante. El selector los agrupa en
  desplegables del color correspondiente, dejando primero y abierto el tipo
  principal del día.
- **Series de aguante cronometradas.** Aguante es un cuarto tipo independiente,
  no una subdivisión de los ejercicios corporales. En sus series se inicia y
  detiene un cronómetro, se conserva la duración y se calcula el descanso entre
  series.
  - *Modelo de datos:* modo de seguimiento en catálogo y sesiones, inicio de
    cronómetro persistente y duración por serie.
- **Cronómetros en notificaciones.** Un ajuste permite mostrar el tiempo
  transcurrido durante descansos, ejercicios de Aguante y Cardio. En Android
  se usa el cronómetro del sistema para continuar contando con la aplicación
  cerrada.
  - *Modelo de datos:* Cardio unificado, preferencia de notificaciones y esquema
    v7.
- **Crear ejercicios al preparar un día.** La creación y edición de días permite
  abrir un formulario visible, elegir el tipo del ejercicio, crearlo y
  seleccionarlo al instante sin pasar antes por Ajustes.
- **Detalle interactivo en los gráficos.** Al pulsar un nodo del gráfico de 1RM
  se muestra la fecha del entrenamiento, el peso y las repeticiones registradas.
- **Nueva sección Personal.** La nueva pestaña reúne la evolución completa del
  peso, el registro corporal y un calendario de actividad estilo GitHub que
  representa la frecuencia e intensidad de los entrenamientos del último año.
  Cada día activo permite abrir directamente el detalle de esa jornada.
- **Entrenar como acción principal.** Entrenar pasa al centro de la barra de
  navegación inferior, se presenta como un botón circular elevado y es la
  pantalla seleccionada al abrir la aplicación.
- **Ajustes simplificados.** Diseño más compacto y profesional, explicaciones
  bajo botones de información y una sección única de Notificaciones con los
  avisos de peso y los cronómetros de entrenamiento.

### Solución de errores
- **Las repeticiones editadas se guardan correctamente.** Al editar las series
  de un ejercicio terminado y pulsar «Listo», el nuevo valor queda persistido y
  se refleja en el histórico.
- **Duraciones reales aunque se olvide finalizar.** La duración termina en la
  última serie o actividad registrada, evitando sesiones de varias horas o días
  por haber pulsado «Fin» tarde.
- **Los ejercicios terminados pueden continuarse.** «Seguir ejercicio» conserva
  las series, repeticiones, descansos y horas, continúa su numeración y actualiza
  la hora de finalización al volver a marcarlo como terminado.
- **Estabilidad de SQLite en Android.** Las consultas se ejecutan de forma
  secuencial para evitar el error de objeto nativo liberado observado con Expo
  SDK 57.
- **Arranque y navegación actualizados para Expo.** Se actualizaron Expo y sus
  dependencias compatibles y se corrigió la estructura de navegación que
  provocaba avisos de rutas sin exportación válida.
- **Entrada correcta de la fecha de nacimiento.** El teclado numérico solo
  requiere escribir ocho cifras; las barras de DD/MM/AAAA se añaden
  automáticamente.

---

## v1.2.0 — 2026-06-14

### Nuevas funcionalidades
- **Peso por serie.** El peso deja de ser únicamente global por ejercicio: cada
  serie puede tener el suyo. Al registrar o editar una serie, junto a las
  repeticiones se muestra el peso (con el valor global del ejercicio como
  predeterminado) y un botón de lápiz para cambiarlo. El histórico, el detalle
  del día y el cálculo de 1RM usan el peso real de cada serie; cuando una serie
  no define peso, hereda el global del ejercicio.
  - *Modelo de datos:* nueva columna `sets.weight` (NULL = hereda el global).
    Migración de esquema v1 → v2 mediante `ALTER TABLE` idempotente, conservando
    todos los datos existentes (las series previas quedan con `weight` NULL y se
    comportan igual que antes). Las copias de seguridad antiguas siguen siendo
    compatibles.
- **Peso corporal visible en ejercicios corporales.** En los ejercicios de peso
  corporal se muestra, en gris junto al lastre, el peso corporal que se
  contabiliza para ese ejercicio. Es el `user_weight` «fotografiado» en la
  sesión (no editable), de modo que el cálculo histórico no cambia aunque luego
  se modifique el peso del perfil.
- **Duración total del entrenamiento.** En el detalle de una jornada
  (calendario → día → tipo de día), la cabecera muestra la duración total de la
  sesión junto al nombre del tipo de día y la hora de inicio/fin. Además, cada
  registro del histórico de un ejercicio muestra el tiempo total de realización
  junto a su hora de inicio y fin.
- **Ejercicios por orden de realización.** En el detalle de una jornada (al
  abrir un día desde el calendario), los ejercicios se ordenan por su hora de
  inicio real (primero arriba, último abajo) en lugar de por su posición en la
  plantilla del día.
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
