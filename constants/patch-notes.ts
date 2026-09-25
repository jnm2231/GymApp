/**
 * Notas de versión (patch notes) de GymApp.
 *
 * Fuente única para la pantalla «Historial de versiones» de Ajustes. Cada
 * versión se organiza en dos apartados formales: «Nuevas funcionalidades»
 * (features) y «Solución de errores» (fixes). Mantener este archivo alineado
 * con docs/CHANGELOG.md al publicar una versión.
 */

export interface PatchEntry {
  /** Titular breve de la entrada. */
  title: string;
  /** Descripción opcional, una o dos frases. */
  detail?: string;
}

export interface VersionNotes {
  /** Número de versión semántica (MAYOR.MENOR.PARCHE). */
  version: string;
  /** Fecha de publicación en formato AAAA-MM-DD, o `null` si está en desarrollo. */
  date: string | null;
  /** Resumen opcional de la versión. */
  summary?: string;
  /** Nuevas funcionalidades introducidas. */
  features: PatchEntry[];
  /** Errores corregidos y mejoras de usabilidad. */
  fixes: PatchEntry[];
}

/** Ordenadas de más reciente a más antigua. */
export const PATCH_NOTES: VersionNotes[] = [
  {
    version: '1.3.0',
    date: '2026-09-20',
    summary: 'Estimaciones, histórico ampliado, registro corporal y nuevos tipos de entrenamiento.',
    features: [
      {
        title: 'Duración media y fin estimado',
        detail:
          'Al comenzar un entrenamiento se muestra la duración media de las últimas 20 sesiones finalizadas de ese mismo día y la hora estimada de finalización. El cálculo usa la hora real de la última serie.',
      },
      {
        title: 'Recordatorio para finalizar el entrenamiento',
        detail:
          'Si pasan 30 minutos sin actividad, una notificación permite finalizar el entrenamiento o indicar que se sigue entrenando.',
      },
      {
        title: 'Histórico global de ejercicios',
        detail:
          'El histórico permite alternar entre todos los ejercicios realizados y una vista por días desplegables. La lista global se puede ordenar por nombre, número de veces realizado o mejor 1RM.',
      },
      {
        title: 'Registro corporal',
        detail:
          'La evolución del peso y el registro corporal comparten una única tarjeta. Edad, altura y último peso se muestran en lectura, con formularios bajo demanda e indicador visual del recordatorio.',
      },
      {
        title: 'Días de musculación, cardio y calistenia',
        detail:
          'Los días se clasifican por Musculación, Cardio o Calistenia. Aguante se mantiene como tipo de ejercicio cronometrado, pero no como tipo de día.',
      },
      {
        title: 'Días con ejercicios de cualquier tipo',
        detail:
          'Cada día puede mezclar ejercicios de musculación, cardio, corporal y aguante. Se muestran en desplegables por color, con el tipo principal primero y abierto.',
      },
      {
        title: 'Series de aguante cronometradas',
        detail:
          'Aguante es un cuarto tipo independiente, identificado en violeta. Cada serie tiene controles para empezar y terminar, registra su duración y calcula el descanso entre series.',
      },
      {
        title: 'Cronómetros en notificaciones',
        detail:
          'Un ajuste permite mostrar el tiempo transcurrido durante descansos, ejercicios de Aguante y Cardio. En Android el cronómetro continúa contando con la aplicación cerrada.',
      },
      {
        title: 'Horario semanal de pesaje',
        detail:
          'Al activar el aviso de peso desde Notificaciones se puede elegir el día y la hora exacta, incluidos los minutos, mediante el selector horario del sistema.',
      },
      {
        title: 'Seguimiento de peso opcional',
        detail:
          'Ajustes permite desactivar el registro semanal. Personal oculta la gráfica y los controles de peso, mantiene peso, altura y edad en lectura y conserva la frecuencia de entrenamiento.',
      },
      {
        title: 'Crear ejercicios al preparar un día',
        detail:
          'La pantalla de creación y edición de días incluye un acceso visible para crear un ejercicio, elegir su tipo y seleccionarlo al instante sin pasar por Ajustes.',
      },
      {
        title: 'Detalle interactivo en los gráficos',
        detail:
          'Al pulsar un punto del gráfico de 1RM aparece la fecha del entrenamiento junto con los pesos y repeticiones registrados.',
      },
      {
        title: 'Nueva sección Personal',
        detail:
          'La nueva pestaña reúne el registro corporal, la evolución completa del peso y un calendario de actividad estilo GitHub que muestra la frecuencia e intensidad del último año.',
      },
      {
        title: 'Entrenar como acción principal',
        detail:
          'El acceso a Entrenar ocupa el centro de la barra inferior y es la pantalla inicial. Al seleccionarlo invierte sus colores y muestra un halo de luz suave.',
      },
      {
        title: 'Ajustes simplificados',
        detail:
          'Ajustes adopta un diseño más compacto, agrupa los avisos de peso y cronómetros en Notificaciones y oculta las explicaciones tras botones de información.',
      },
    ],
    fixes: [
      {
        title: 'Las repeticiones editadas se guardan correctamente',
        detail:
          'Al editar las series de un ejercicio terminado y pulsar «Listo», el nuevo número de repeticiones queda guardado y se refleja en el histórico.',
      },
      {
        title: 'Duraciones reales aunque se olvide finalizar',
        detail:
          'La duración termina en la última serie o actividad registrada, evitando entrenamientos de varias horas o días por haber pulsado «Fin» tarde.',
      },
      {
        title: 'Los ejercicios terminados pueden continuarse',
        detail:
          '«Seguir ejercicio» conserva series, repeticiones, descansos y horas, continúa la numeración y actualiza la nueva hora de finalización.',
      },
      {
        title: 'Estabilidad de SQLite en Android',
        detail:
          'Las consultas a la base de datos se ejecutan de forma secuencial para evitar el error de objeto nativo liberado observado con Expo SDK 57.',
      },
      {
        title: 'Arranque y navegación actualizados para Expo',
        detail:
          'Se actualizaron Expo y sus dependencias compatibles y se corrigió la estructura de navegación que provocaba avisos de rutas sin exportación válida.',
      },
      {
        title: 'Entrada correcta de la fecha de nacimiento',
        detail:
          'El teclado numérico ya no exige introducir barras: la aplicación forma automáticamente la fecha DD/MM/AAAA.',
      },
      {
        title: 'Barra inferior estable',
        detail:
          'Se fijan las cinco posiciones de navegación para mantener Histórico visible y Entrenar siempre en el centro, sin bordes ni destellos blancos al pulsar las pestañas.',
      },
      {
        title: 'Calistenia correctamente diferenciada',
        detail:
          'El formulario utiliza «Día de Calistenia» para las plantillas y reserva «Corporal» exclusivamente para el tipo de ejercicio. Al editar un día se puede cambiar su tipo sin perder ejercicios.',
      },
      {
        title: 'El interruptor de cronómetros conserva su estado',
        detail:
          'La preferencia ya no se desactiva automáticamente en entornos sin el módulo nativo y queda preparada para funcionar en la aplicación instalada.',
      },
      {
        title: 'Colores coherentes durante el entrenamiento',
        detail:
          'El ejercicio activo y sus cápsulas de descanso usan ahora el color de su tipo. Aguante adopta el mismo formato compacto de descansos que Musculación y Corporal.',
      },
      {
        title: 'Estado correcto del recordatorio de peso',
        detail:
          'La campana de Personal solo se ilumina cuando el seguimiento y su notificación semanal están realmente activados.',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-14',
    features: [
      {
        title: 'Peso por serie',
        detail:
          'Cada serie puede tener su propio peso. Al registrar o editar una serie, junto a las repeticiones aparece el peso (con el valor global del ejercicio por defecto) y un botón de lápiz para cambiarlo. El histórico y el 1RM tienen en cuenta el peso de cada serie.',
      },
      {
        title: 'Peso corporal visible en ejercicios corporales',
        detail:
          'En los ejercicios de peso corporal se muestra, en gris junto al lastre, el peso corporal que se contabiliza para ese ejercicio. Es el peso del usuario guardado en el momento de la sesión y no se puede modificar.',
      },
      {
        title: 'Duración total del entrenamiento',
        detail:
          'En el detalle de una jornada (calendario → día → tipo de día), la cabecera muestra la duración total de la sesión junto al nombre y la hora de inicio/fin. Además, cada registro del histórico de un ejercicio muestra el tiempo total de realización junto a su hora de inicio y fin.',
      },
      {
        title: 'Ejercicios por orden de realización',
        detail:
          'En el detalle de una jornada (al abrir un día desde el calendario), los ejercicios se ordenan por orden de realización —el primero realizado arriba y el último abajo— en lugar de por su posición en la plantilla del día.',
      },
      {
        title: 'Historial de versiones',
        detail:
          'Nueva pantalla accesible desde Ajustes que recoge las notas de cada versión, organizadas en «Nuevas funcionalidades» y «Solución de errores».',
      },
    ],
    fixes: [],
  },
  {
    version: '1.1.0',
    date: '2026-06-14',
    features: [
      {
        title: 'Temporizador de descanso en vivo',
        detail:
          'Durante el ejercicio activo, al confirmar una serie aparece un cronómetro (formato M:SS) que indica el tiempo transcurrido desde la última serie. Se calcula a partir de marcas de tiempo, sin procesos en segundo plano.',
      },
      {
        title: 'Confirmación visual al guardar',
        detail:
          'Los botones de guardado de Ajustes (peso y notas) confirman la acción mediante una animación de color y un indicador de éxito.',
      },
      {
        title: 'Calendario con desplazamiento interactivo',
        detail:
          'El arrastre sigue al dedo y muestra el mes adyacente en tiempo real; el cambio de mes se confirma únicamente al superar el umbral.',
      },
      {
        title: 'Rediseño visual del calendario',
        detail:
          'Días representados como celdas redondeadas, jornadas con entrenamiento resaltadas y el día actual destacado.',
      },
      {
        title: 'Un marcador por tipo de día',
        detail:
          'Cuando una jornada incluye varios tipos de día, cada uno se muestra como un recuadro independiente, con un indicador «+N más» cuando no caben todos.',
      },
      {
        title: 'Acceso directo en el detalle del día',
        detail:
          'Si la jornada tiene un único tipo de día, se omite el nivel intermedio y se abren directamente sus ejercicios.',
      },
      {
        title: 'Diálogos con estilo propio',
        detail:
          'Los avisos y confirmaciones adoptan el tema oscuro de la aplicación, en sustitución de los cuadros del sistema.',
      },
      {
        title: 'Copia al portapapeles en Notas de desarrollo',
        detail: 'Nuevo botón para copiar el contenido de las notas con su propia animación.',
      },
      {
        title: 'Catálogo de ejercicios plegable',
        detail:
          'Con más de cinco ejercicios, el catálogo se contrae y se despliega mediante un control «Ver todos».',
      },
      {
        title: 'Autoría en Ajustes',
        detail: 'La pantalla de Ajustes muestra el crédito «Creado por jnm2231».',
      },
    ],
    fixes: [
      {
        title: 'El teclado ya no oculta los campos de texto',
        detail:
          'Al editar las notas de desarrollo o las repeticiones al final de la lista, la pantalla se desplaza para mantener el campo visible.',
      },
      {
        title: 'Corregido el parpadeo del calendario al cambiar de mes',
        detail:
          'El paginador propio se sustituyó por un desplazamiento nativo, eliminando el fotograma intermedio con el mes incorrecto.',
      },
      {
        title: 'Eliminados los destellos blancos en las transiciones',
        detail:
          'Se fijó el fondo del tema en la vista raíz, evitando el parpadeo blanco al abrir el detalle del día o al volver atrás.',
      },
      {
        title: 'Navegación «atrás» coherente en el detalle del día',
        detail:
          'El botón de retroceso respeta el nivel de navegación y vuelve a la lista de tipos de día cuando corresponde.',
      },
      {
        title: 'Corregido el parpadeo del histórico al cambiar de tipo de día',
        detail:
          'Los ejercicios se cargan antes de cambiar de pantalla, evitando que se muestren brevemente los datos anteriores.',
      },
      {
        title: 'Corregido el empaquetado para web',
        detail:
          'Se añadió la configuración necesaria (soporte de .wasm y cabeceras COOP/COEP) para expo-sqlite en la versión web.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: null,
    summary: 'Primera versión funcional de la aplicación, compilada como APK.',
    features: [
      {
        title: 'Registro de entrenamientos 100% local',
        detail: 'Almacenamiento en SQLite, sin conexión a internet ni cuenta de usuario.',
      },
      {
        title: 'Días de entrenamiento configurables',
        detail: 'Plantillas de día compuestas a partir de un catálogo de ejercicios.',
      },
      {
        title: 'Sesión activa con cálculo de descansos',
        detail:
          'Peso global por ejercicio, series en línea, descanso calculado por marcas de tiempo y posibilidad de reordenar o añadir ejercicios.',
      },
      {
        title: 'Calendario mensual',
        detail: 'Marcadores de entrenamiento y navegación detallada por jornada.',
      },
      {
        title: 'Histórico con gráfico de progreso',
        detail: 'Evolución del 1RM promedio y listado completo de registros por ejercicio.',
      },
      {
        title: 'Ajustes y copias de seguridad',
        detail:
          'Catálogo de ejercicios, peso del usuario, exportación e importación en .json (excluyendo las notas) y notas de desarrollo.',
      },
    ],
    fixes: [],
  },
];

/** Versión más reciente (la primera de la lista). */
export const CURRENT_VERSION = PATCH_NOTES[0]?.version ?? '1.3.0';
