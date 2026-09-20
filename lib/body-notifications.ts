import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BODY_REMINDER_TYPE = 'weekly-body-weight-reminder';
const WEEK_SECONDS = 7 * 24 * 60 * 60;
type NotificationsModule = typeof import('expo-notifications');

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Constants.executionEnvironment === 'storeClient') return null;
  return import('expo-notifications');
}

async function cancelExisting(Notifications: NotificationsModule): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.type === BODY_REMINDER_TYPE)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

export async function disableWeeklyWeightReminder(): Promise<void> {
  const Notifications = await loadNotifications();
  if (Notifications) await cancelExisting(Notifications);
}

export async function scheduleWeeklyWeightReminder(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;

  await cancelExisting(Notifications);
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('body-records', {
      name: 'Registro corporal',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Registra tu peso semanal',
      body: 'Ha pasado una semana. Añade tu peso para mantener actualizado el registro corporal.',
      data: { type: BODY_REMINDER_TYPE },
      ...(Platform.OS === 'android' ? { channelId: 'body-records' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: WEEK_SECONDS,
      repeats: true,
    },
  });
  return true;
}

export async function ensureWeeklyWeightReminder(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.some((item) => item.content.data?.type === BODY_REMINDER_TYPE)) return true;
  return scheduleWeeklyWeightReminder();
}
