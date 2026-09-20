import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { finishSession, getSession } from '@/db/sessions';

export const WORKOUT_REMINDER_CATEGORY = 'workout-idle-reminder';
export const WORKOUT_REMINDER_TYPE = 'workout-idle-reminder';
export const FINISH_ACTION = 'finish-workout';
export const CONTINUE_ACTION = 'continue-workout';
const REMINDER_DELAY_SECONDS = 30 * 60;
type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

let configured = false;

/** Expo Go Android no incluye expo-notifications desde SDK 53. */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Constants.executionEnvironment === 'storeClient') return null;
  return import('expo-notifications');
}

export async function configureWorkoutNotifications(): Promise<NotificationsModule | null> {
  const Notifications = await loadNotifications();
  if (!Notifications || configured) return Notifications;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  void Notifications.setNotificationCategoryAsync(WORKOUT_REMINDER_CATEGORY, [
    {
      identifier: FINISH_ACTION,
      buttonTitle: 'Finalizar entrenamiento',
      options: { isDestructive: true },
    },
    {
      identifier: CONTINUE_ACTION,
      buttonTitle: 'No, sigo entrenando',
    },
  ]);

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('workout', {
      name: 'Entrenamiento',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#B8FF3D',
    });
  }

  return Notifications;
}

async function notificationsAreEnabled(Notifications: NotificationsModule): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === 'granted';
}

async function cancelRemindersForSession(
  Notifications: NotificationsModule,
  sessionId: number
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => {
        const data = notification.content.data as { type?: string; sessionId?: number };
        return data.type === WORKOUT_REMINDER_TYPE && data.sessionId === sessionId;
      })
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
  );
}

/** Programa el aviso 30 minutos después de la última serie de la sesión. */
export async function scheduleWorkoutReminder(
  db: SQLiteDatabase,
  sessionId: number,
  delayFromNowSeconds?: number
): Promise<void> {
  const lastSet = await db.getFirstAsync<{ last_ts: number | null }>(
    `SELECT MAX(activity_ts) AS last_ts FROM (
       SELECT st.ts AS activity_ts
         FROM sets st
         JOIN session_exercises se ON se.id = st.session_exercise_id
        WHERE se.session_id = ?
       UNION ALL
       SELECT ce.ts AS activity_ts
         FROM cardio_entries ce
         JOIN session_exercises se ON se.id = ce.session_exercise_id
        WHERE se.session_id = ?
     )`,
    [sessionId, sessionId]
  );
  if (!lastSet?.last_ts) return;

  const session = await getSession(db, sessionId);
  if (!session || (session.status !== 'active' && session.status !== 'paused')) return;

  const Notifications = await configureWorkoutNotifications();
  if (!Notifications || !(await notificationsAreEnabled(Notifications))) return;
  await cancelRemindersForSession(Notifications, sessionId);

  const elapsedSeconds = Math.floor((Date.now() - lastSet.last_ts) / 1000);
  const seconds = delayFromNowSeconds ?? Math.max(1, REMINDER_DELAY_SECONDS - elapsedSeconds);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '¿Acabaste el entreno?',
      body: 'Recuerda darle a finalizar para guardar el entrenamiento.',
      categoryIdentifier: WORKOUT_REMINDER_CATEGORY,
      data: { type: WORKOUT_REMINDER_TYPE, sessionId },
      ...(Platform.OS === 'android' ? { channelId: 'workout' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
}

export async function cancelWorkoutReminder(sessionId: number): Promise<void> {
  const Notifications = await configureWorkoutNotifications();
  if (Notifications) await cancelRemindersForSession(Notifications, sessionId);
}

export async function handleWorkoutNotificationResponse(
  db: SQLiteDatabase,
  response: NotificationResponse
): Promise<void> {
  const data = response.notification.request.content.data as {
    type?: string;
    sessionId?: number;
  };
  if (data.type !== WORKOUT_REMINDER_TYPE || typeof data.sessionId !== 'number') return;

  const session = await getSession(db, data.sessionId);
  if (!session || (session.status !== 'active' && session.status !== 'paused')) return;

  if (response.actionIdentifier === FINISH_ACTION) {
    await finishSession(db, data.sessionId);
    await cancelWorkoutReminder(data.sessionId);
  } else if (response.actionIdentifier === CONTINUE_ACTION) {
    await scheduleWorkoutReminder(db, data.sessionId, REMINDER_DELAY_SECONDS);
  }
}

/** Escucha las acciones de la notificación cuando la build nativa las soporta. */
export async function subscribeToWorkoutNotificationResponses(
  db: SQLiteDatabase
): Promise<() => void> {
  const Notifications = await configureWorkoutNotifications();
  if (!Notifications) return () => {};

  const handleResponse = (response: NotificationResponse) => {
    void handleWorkoutNotificationResponse(db, response);
    Notifications.clearLastNotificationResponse();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse) handleResponse(lastResponse);
  return () => subscription.remove();
}
