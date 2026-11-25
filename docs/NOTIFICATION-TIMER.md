# Cronómetro de las notificaciones Android

**Estado actual:** identificada y corregida la causa raíz por la que el parche
nativo de `expo-notifications` no se incluía en el APK compilado, además de una
condición de carrera al crear los canales de notificación y ajustes de visibilidad
en pantalla de bloqueo. Queda pendiente verificar el APK nuevo en dispositivo.

## Diagnóstico

El síntoma reportado en un CMF Phone 2 Pro con el APK instalado era una
notificación que solo mostraba «Tiempo transcurrido», sin contador.

El código enviaba correctamente `_gymTimerStartedAt` dentro de `data` (que en
`expo-notifications` 57.0.21 `ArgumentsNotificationContentBuilder` serializa en
`NotificationContent.body`). Sin embargo, existían dos problemas reales:

1. **Gradle ignoraba `android/src/` de `expo-notifications` y enlazaba el `.aar` precompilado:**
   `node_modules/expo-notifications/expo-module.config.json` declara
   `android.publication` apuntando a `local-maven-repo`
   (`host.exp.exponent:expo.modules.notifications:57.0.21`). En Expo SDK 57,
   `expo-modules-autolinking` (`SettingsManager.kt`) usa esa publicación
   precompilada salvo que el módulo aparezca en
   `expo.autolinking.android.buildFromSource`. Como no estaba configurado en
   `package.json`, Gradle compilaba con el `.aar` original sin
   `ExpoNotificationBuilder.kt`, `GymTimerNotification.kt` ni
   `gym_timer_notification.xml`.
2. **Condición de carrera en la creación de canales:**
   `configureWorkoutNotifications()` en `lib/workout-notifications.ts` marcaba
   `configured = true` antes de completar `setNotificationCategoryAsync` y
   `setNotificationChannelAsync` (lanzados con `void`), por lo que la primera
   notificación podía programarse antes de existir el canal `workout-timers` y
   caer en el canal por defecto.

## Corrección

- **`package.json` (`expo.autolinking.android.buildFromSource`):** incluye
  `"expo-notifications"` para que `expo-modules-autolinking` resuelva
  `configuration.buildFromSource = ["expo-notifications"]`, desactive
  `shouldUsePublication` en Gradle y compile desde `android/src/` con el parche
  aplicado.
- **`patches/expo-notifications+57.0.21.patch`:**
  - `ExpoNotificationBuilder.kt`: lee `_gymTimerStartedAt` de forma segura con
    `content.body?.optDouble("_gymTimerStartedAt", 0.0)?.toLong() ?: 0L` por si
    los números de JS se serializan como `Double` en `JSONObject`.
  - `GymTimerNotification.kt`: añade `NotificationCompat.VISIBILITY_PUBLIC` y
    `NotificationCompat.CATEGORY_STOPWATCH` para su correcta visualización en
    segundo plano y pantalla de bloqueo, junto con `RemoteViews` y `Chronometer`
    en las vistas plegada, expandida y flotante.
  - `gym_timer_notification.xml`: layout compacto con `Chronometer` en System UI
    (sin intervalo de JS ni servicio en primer plano).
  - `postinstall` ejecuta `patch-package --error-on-fail` para fallar si el
    parche no aplica limpiamente.
- **`lib/workout-notifications.ts`:**
  - `configureWorkoutNotifications()` reutiliza una promesa singleton
    (`configurePromise`) que espera (`await`) a `setNotificationCategoryAsync` y
    `setNotificationChannelAsync`, evitando carreras en llamadas concurrentes.
  - Los canales `workout` y `workout-timers` configuran
    `lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC`
    (y `showBadge: false` en `workout-timers`).
  - `setNotificationHandler` mantiene `shouldShowBanner: true` y
    `shouldShowList: true` para primer plano.

Referencias: [cronómetro de cabecera](https://developer.android.com/reference/android/app/Notification.Builder#setUsesChronometer(boolean)),
[contenido personalizado](https://developer.android.com/develop/ui/views/notifications/custom-notification) y
[RemoteViews.setChronometer](https://developer.android.com/reference/android/widget/RemoteViews#setChronometer(int,%20long,%20java.lang.String,%20boolean)).

## Compilación y prueba en dispositivo

Hace falta **compilar e instalar un APK nuevo**. Recargar JavaScript, reiniciar
la aplicación o actualizar su contenido sin compilar Android no instala estos
cambios. Expo Go tampoco incluye este parche. Ver [compilación del APK](./COMPILAR-APK.md).

1. Instalar las dependencias y comprobar que `postinstall` (`npx patch-package --error-on-fail`) aplica el parche sin errores.
2. Verificar con `npx expo-modules-autolinking resolve -p android --json` que `configuration.buildFromSource` incluye `"expo-notifications"`.
3. Compilar el APK e instalarlo como actualización de la aplicación existente.
4. Activar los cronómetros en Ajustes, empezar un entrenamiento y confirmar una
   serie. La notificación debe mostrar «Descanso · ejercicio» y un contador.
5. Comprobar durante al menos 10 segundos que los segundos avanzan tanto con la
   notificación plegada como expandida. Compararlos con el descanso en la app.
6. Salir a Inicio, bloquear el móvil un minuto y volver a mirar: el tiempo debe
   incluir ese minuto (y mostrarse en pantalla de bloqueo). Repetir retirando
   la app de recientes, sin forzar su detención desde Ajustes de Android.
7. Confirmar otra serie: se sustituye la misma notificación y el descanso empieza
   de nuevo. Terminar el ejercicio, finalizar la sesión o desactivar los
   cronómetros debe retirar la notificación.
8. Probar Aguante (serie → descanso → serie) y Cardio; verificar también un
   nombre de ejercicio largo y los temas claro y oscuro del móvil.

Estas comprobaciones visuales siguen pendientes en el CMF Phone 2 Pro; las
comprobaciones de código, autolinking y parche no equivalen a probar su System UI.
