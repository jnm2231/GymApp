# Cronómetro de las notificaciones Android

## Diagnóstico

El síntoma reportado en un CMF Phone 2 Pro con el APK instalado es una
notificación que solo muestra «Tiempo transcurrido».

El código anterior enviaba correctamente `_gymTimerStartedAt` dentro de `data`.
En expo-notifications 57.0.21, `ArgumentsNotificationContentBuilder` convierte
ese `data` en `NotificationContent.body`. No hay que cambiarlo al `body` de JS:
ese otro campo es el texto visible.

El parche anterior solo activaba `setUsesChronometer(true)`, que convierte el
espacio de la hora del sistema en un contador. No añadía ningún contador al
cuerpo, que seguía siendo un `BigTextStyle` con texto fijo. Sin una reproducción
en el teléfono no se puede confirmar si la cabecera de su sistema ocultaba el
contador o si el APK instalado carecía del parche nativo.

## Corrección

`patches/expo-notifications+57.0.21.patch` añade `GymTimerNotification` y un
layout Android con un `Chronometer` explícito. Se usa para las notificaciones
`workout-live-timer` con una marca temporal positiva. El resto de notificaciones
conserva su presentación habitual.

- El contador está en las vistas plegada, expandida y flotante.
- `RemoteViews.setChronometer(..., true)` arranca el reloj en System UI; no se
  necesita un intervalo de JavaScript ni un servicio activo en la aplicación.
- La base del reloj se convierte de Unix milisegundos a `elapsedRealtime()`.
  Volver a presentar un descanso conserva el tiempo desde la última serie.
- El contador de cabecera se conserva como complemento.
- Se usan los estilos de texto de notificaciones AndroidX y un layout compacto,
  sin colores de fondo fijos. El nombre largo se recorta antes que el contador.
- `postinstall` falla si el parche no se puede aplicar; no se debe continuar
  compilando con una extensión nativa incompleta.

Referencias: [cronómetro de cabecera](https://developer.android.com/reference/android/app/Notification.Builder#setUsesChronometer(boolean)),
[contenido personalizado](https://developer.android.com/develop/ui/views/notifications/custom-notification) y
[RemoteViews.setChronometer](https://developer.android.com/reference/android/widget/RemoteViews#setChronometer(int,%20long,%20java.lang.String,%20boolean)).

## Compilación y prueba en dispositivo

Hace falta **compilar e instalar un APK nuevo**. Recargar JavaScript, reiniciar
la aplicación o actualizar su contenido sin compilar Android no instala estos
cambios. Expo Go tampoco incluye este parche. Ver [compilación del APK](./COMPILAR-APK.md).

1. Instalar las dependencias y comprobar que `postinstall` aplica el parche.
2. Compilar el APK e instalarlo como actualización de la aplicación existente.
3. Activar los cronómetros en Ajustes, empezar un entrenamiento y confirmar una
   serie. La notificación debe mostrar «Descanso · ejercicio» y un contador.
4. Comprobar durante al menos 10 segundos que los segundos avanzan tanto con la
   notificación plegada como expandida. Compararlos con el descanso en la app.
5. Salir a Inicio, bloquear el móvil un minuto y volver a mirar: el tiempo debe
   incluir ese minuto. Repetir retirando la app de recientes, sin forzar su
   detención desde Ajustes de Android.
6. Confirmar otra serie: se sustituye la misma notificación y el descanso empieza
   de nuevo. Terminar el ejercicio, finalizar la sesión o desactivar los
   cronómetros debe retirar la notificación.
7. Probar Aguante (serie → descanso → serie) y Cardio; verificar también un
   nombre de ejercicio largo y los temas claro y oscuro del móvil.

Estas comprobaciones visuales siguen pendientes en el CMF Phone 2 Pro; las
comprobaciones de código y compilación no equivalen a probar su System UI.
