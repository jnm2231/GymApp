# Vinculación de Strava en GymApp 1.4.1

1. Crea una aplicación en [Strava API Settings](https://www.strava.com/settings/api).
2. Configura `strava-callback` como **Authorization Callback Domain**. La URL
   completa de retorno de GymApp es `gymapp://strava-callback`.
3. En la app móvil, abre **Ajustes → Configurar Strava** e introduce el
   `client_id` y el `client_secret` de esa aplicación. No los añadas al código.
4. Crea un ejercicio de tipo **Cardio** desde esta pantalla o desde el catálogo,
   asigna los deportes de Strava a ese ejercicio, elige el alcance inicial y
   pulsa **Vincular cuenta de Strava**. GymApp creará o reutilizará un día de
   cardio con el mismo nombre cuando importe la primera actividad.

Si la autorización abre una pantalla «Unmatched Route», instala una versión de
GymApp que incluya la ruta `strava-callback` y vuelve a pulsar **Vincular cuenta
de Strava**. El código de autorización anterior no debe reutilizarse.

GymApp solicita permiso `activity:read_all` para incluir actividades privadas.
Los tokens y el secreto se guardan en SecureStore; las actividades, sus detalles
y las asignaciones se guardan en SQLite. Una actividad se importa una sola vez
por su ID. Las actividades sin asignación quedan pendientes hasta elegir un
ejercicio. Las importaciones se consultan en Calendario, en el histórico del
ejercicio y en la vista Strava de Histórico.
Las kcal no se muestran en la ficha de Strava de GymApp.
La app renueva los tokens, consulta Strava al abrirse o volver a primer plano y
ofrece **Sincronizar ahora**. Las actividades ya importadas permanecen al
desconectar. Las copias de seguridad incluyen actividades y asignaciones, pero
no credenciales ni cursores de sincronización.

La integración local permite desarrollo y uso personal. Para distribuir una
aplicación pública con una misma aplicación de Strava para muchos usuarios, el
intercambio y la renovación de tokens deben pasar por un servicio que proteja
el `client_secret`; no debe distribuirse un secreto compartido en el cliente.
