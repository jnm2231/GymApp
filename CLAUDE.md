@AGENTS.md
# Contexto y Rol
Actúa como un desarrollador Senior (Full-Stack Mobile) experto en React Native, Expo Router (usando la última versión), TypeScript y bases de datos locales.

Tu tarea es desarrollar desde cero una aplicación móvil para registrar rutinas de gimnasio. Quiero que escribas el código de forma modular, me guíes paso a paso para probarla en Expo Go, y al final me des instrucciones para compilar el archivo APK para Android.

# Arquitectura y Base de Datos
* **Almacenamiento 100% Local:** Usa `expo-sqlite`. No habrá backend externo ni sincronización en la nube.
* **Timestamp Obligatorio:** Se debe registrar el día y la hora exacta a la que se inicia y se finaliza una sesión de entrenamiento completa.
* **Esquema Relacional:** Diseña tablas eficientes para Rutinas/Días, Ejercicios, Series (que incluya repeticiones y el tiempo de descanso calculado) y Notas de Desarrollo. Ten en cuenta que el Peso utilizado se anota de forma global para todo el ejercicio en esa sesión, no por serie.
* **Peso Corporal:** Debe existir una variable global (configurable en Ajustes) para el "Peso del Usuario", estrictamente necesaria para los cálculos de fuerza en ciertos ejercicios.

# Lógica de la Interfaz y Cronómetro
* **Foco visual de Ejercicio Activo:** En la pantalla de sesión, el ejercicio que se está realizando debe estar resaltado visualmente (ejemplo: borde verde para indicar que es el activo). Los demás deben estar en espera o bloqueados visualmente.
* **Cronómetro basado en Timestamps:** En vez de hacer un cronómetro ejecutándose en segundo plano (que consume recursos), la lógica será: al confirmar la primera serie, se guarda la hora exacta. Al introducir las siguientes series, el tiempo de descanso se calcula restando el timestamp de la serie actual del timestamp de la serie INMEDIATAMENTE ANTERIOR. Cuando el ejercicio se termine, se debe mostrar el tiempo total de realización del ejercicio.
* **Estado de la Interfaz:** Al pulsar el botón "Terminado" (Done) de un ejercicio, este se bloquea visualmente guardando la info y se activa el siguiente. Debe existir un botón "Lápiz" (Editar) para desbloquearlo si el usuario comete un error.

# Iconos y Barra de Navegación
* **Barra de Navegación:** Debe de estar en la parte inferior del móvil usando un Layout (Tabs de Expo Router) para que sea visible en todo momento.
* **Iconos principales:**
  * **Pantalla Principal / Entrenamiento:** Icono de Pesa con un signo '+'.
  * **Calendario:** Icono de Calendario.
  * **Histórico:** Icono de Gráfico de líneas.
  * **Ajustes:** Icono de Engranaje.

---

# Especificaciones Detalladas por Pantalla

### 1. Pantalla Inicial (Home / Tipos de Día)
* **Listado Principal:** Muestra la lista de los días de entrenamiento creados (ejemplo: Pecho, Espalda, Pierna).
* **Botón Nuevo Día:** Lleva a un formulario para crear nuevas plantillas de entrenamiento, donde se introduce el nombre del día y se seleccionan los ejercicios que van a componerlo desde un catálogo global. (Mismo formulario al que se accede desde la pantalla de ajustes).

### 2. Pantalla de Sesión Activa (Día de Entrenamiento)
* **Acceso y Comportamiento:** Se accede al pulsar "empezar entrenamiento" en la pantalla principal. Si hay un entrenamiento activo y el usuario navega a otra pestaña, al pulsar el icono de "Pesa" en la barra inferior debe volver a esta sesión activa. Si no hay entrenamiento activo, el icono lleva a la Pantalla Inicial.
* **Cabecera de Sesión:** Muestra el nombre del día y la hora exacta de inicio de la sesión.
* **Lista de Bloques de Ejercicio:** Cada bloque representa un ejercicio y debe contener:
  * **Cabecera del bloque:** Nombre del ejercicio.
  * **Input de Peso Global:** Al lado del nombre, un input con "kg" al lado. Se debe introducir y confirmar este peso global (pasando a modo lectura) antes de empezar a registrar las series.
  * **Inputs de Serie Dinámicos (Diseño Inline):** El registro se hace por filas y de forma indefinida. Se muestra la Serie 1 con su input de repeticiones y un botón de confirmación (ej: tick verde "✓"). Al pulsar el tick, el input pasa a ser texto, se guarda el timestamp, y **aparece automáticamente una nueva fila debajo** para la siguiente serie. El descanso se calcula respecto al tick anterior (la primera serie no tiene descanso).
  * **Colapso visual al Terminar:** Cuando el usuario pulsa el botón global del bloque "Terminado", TODAS las filas de input desaparecen y la información de las series se colapsa en una sola línea de texto limpio con el formato `XX-YY-ZZ-WW` (Ej: `12-12-12-10`), ahorrando espacio visual en pantalla.
  * **Hora de Inicio:** Formato `(HH:MM)`. Aparece al confirmar la primera serie.
  * **Hora de Fin:** Formato `(HH:MM)`. Aparece al darle al botón "Terminado".
  * **Referencia del Día Anterior:** En la parte inferior del bloque, en texto pequeñito, se debe mostrar un resumen del último día que se hizo este ejercicio (Ejemplo: `95kg: 8-8-8-7`).
* **Botones por Bloque de Ejercicio:**
  * **Histórico:** Icono de gráfico que abre el historial específico de ese movimiento.
  * **Terminado:** Quita el borde verde, guarda el estado, ejecuta el colapso visual de las series y permite seleccionar otro ejercicio. Una vez pulsado, este botón desaparece.
  * **Editar (Lápiz):** Permite corregir peso/repes volviendo a desplegar los inputs. *OJO: La hora/tiempo cronometrado original NO debe alterarse al editar un input.*
* **Controles Globales de Sesión (Encima de la barra de navegación):**
  * **Guardar:** Pausa el estado en la BD para cerrar la app y retomar luego.
  * **Fin:** Termina la sesión por completo, guarda la hora de finalización y el registro.
  * **Ejercicio Adicional:** Añade un ejercicio extra sobre la marcha sin alterar la plantilla base del día.

### 3. Pantalla de Histórico y Gráfico
* **Acceso:** Desde el icono de Gráfico en la barra de navegación.
* **Flujo de Navegación (Drill-down):**
  1. **Lista de Tipos de Día:** Bloques principales (Pecho, Espalda, etc.).
  2. **Lista de Ejercicios:** Al pulsar un día, se listan los ejercicios asignados a ese día (solo el nombre).
  3. **Vista de Gráfico e Historial:** Al pulsar un ejercicio, se entra a su pantalla de detalle.
* **Sección Superior (Gráfico):**
  * **Eje X (Tiempo Equiespaciado):** Muestra los días de realización. Puntos separados a la misma distancia visual, ignorando el tiempo real transcurrido entre ellos.
  * **Eje Y (1RM Promedio):** Media del 1RM de todas las series del día para no distorsionar la escala.
  * **Fórmulas:** $1RM = Peso \times \left(1 + \frac{Repeticiones}{30}\right)$ y para el valor diario $\frac{1RM_1 + 1RM_2 + ... + 1RM_n}{Total\ de\ Series}$
* **Sección Inferior (Lista de Registros):**
  * Debajo del gráfico, una lista scrollable con todo el histórico de ese ejercicio.
  * Cada bloque muestra: Fecha arriba, Hora (Inicio - Fin) al lado. Nombre del ejercicio, peso global (kg) y debajo las repeticiones detallando el tiempo de descanso de cada una.

### 4. Pantalla de Calendario
* **Acceso:** Desde el icono de Calendario en la barra inferior.
* **Vista Principal:** Calendario del mes actual marcando el día de hoy.
* **Navegación:** Swipe lateral para cambiar de mes. Pulsar el texto del Mes/Año abre un selector rápido (modal/dropdown) para ir a una fecha específica sin hacer swipe.
* **Marcadores:** Si el día 12 se hizo "Espalda", dentro de la casilla del día 12 debe leerse "Espalda". Los días sin entrenamiento no hacen nada al pulsarlos.
* **Flujo de Detalle de Día (Drill-down):**
  1. Al pulsar un día con entrenamiento, se abre una lista con el bloque del TIPO DE DÍA (Ej: "Bloque ESPALDA") y su hora de inicio/fin. Si ese día se hicieron dos tipos de día distintos (p.ej Pecho y luego Espalda) debe mostrarse un bloque de pecho y un bloque de espalda.
  2. Al pulsar ese bloque, se abre una lista scrollable vertical con los bloques de los ejercicios de ese día (Ej: "Bloque Dominadas").
  3. Dentro de cada bloque de ejercicio se ve: Nombre, peso global (kg), repeticiones (con el descanso de cada una), y hora de inicio/fin `(XX:XX - YY:YY)`.
  4. Si se pulsa uno de estos bloques de ejercicio, navega directamente a la pantalla del Gráfico Histórico de ese ejercicio concreto.

### 5. Pantalla de Ajustes
* **Catálogo de Ejercicios:** Panel para crear nuevos ejercicios base (nombre y tipo de carga). **MUY IMPORTANTE:** Aquí se define el flag `es_corporal`. Si es corporal (ej: Dominadas), al calcular el 1RM, el valor "Peso" en la fórmula matemática debe ser la suma del Peso del Usuario (guardado en Ajustes) más el Peso del Lastre añadido en el input.
* **Gestión de Perfil:** Input numérico para el peso actual del usuario.
* **Copias de Seguridad (Crucial):** Debes escribir el código funcional para EXPORTAR toda la base de datos a un archivo `.db` o `.json`, y también la lógica completa y funcional para IMPORTAR uno de esos archivos desde el dispositivo, sobrescribiendo/restaurando la base de datos desde el primer momento.
* **Notas de Desarrollo (Backlog):** Área de texto libre. La tabla `Notas_Desarrollo` se excluye obligatoriamente de la exportación/importación.
NOTA: Te adjuntaré un archivo de ajustes de otro proyecto para que copies la estructura y el estilo, sobre todo para hacer la sección de backup.

---

# Plan de Ejecución Solicitado
Sigue este orden de manera estricta y espera mi confirmación en cada paso:

1. **Paso 1: Diseño de la Base de Datos SQLite.** Diseña las tablas (`CREATE TABLE`), relaciones, timestamps, flag `es_corporal` y tabla de Notas. Asegúrate de adaptar la tabla a un peso global por ejercicio y no por serie. **Espera mi confirmación antes de escribir más código.**
2. **Paso 2: Estructura Base y Navegación.** Crea el enrutamiento con Expo Router, configurando las Tabs inferiores.
3. **Paso 3: Desarrollo Iterativo.** Construye pantalla por pantalla: Ajustes -> Pantalla Inicial -> Sesión Activa -> Histórico -> Calendario.
--Parate aquí para que pruebe la aplicación con Expo Go y yo te diré cuando continuar o si hayq ue hacer modificaciones adicionales--
4. **Paso 4: Documentación y Compilación.** Documenta el uso y dame las instrucciones de configuración del `eas.json` para compilar el APK.