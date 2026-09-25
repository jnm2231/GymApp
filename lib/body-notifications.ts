import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BODY_REMINDER_TYPE = 'weekly-body-weight-reminder';
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

export async function scheduleWeeklyWeightReminder(
  day = 1,
  hour = 9,
  minute = 0
): Promise<boolean> {
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
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: day + 1,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: 'body-records' } : {}),
    },
  });
  return true;
}

export async function ensureWeeklyWeightReminder(day = 1, hour = 9, minute = 0): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.find((item) => item.content.data?.type === BODY_REMINDER_TYPE);
  const trigger = existing?.trigger as
    | { type?: string; weekday?: number; hour?: number; minute?: number }
    | undefined;
  if (
    trigger?.type === 'weekly' &&
    trigger.weekday === day + 1 &&
    trigger.hour === hour &&
    trigger.minute === minute
  ) {
    return true;
  }
  return scheduleWeeklyWeightReminder(day, hour, minute);
}
