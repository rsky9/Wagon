import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './config'

const STORAGE_KEY = 'wagon_push_registered'

/**
 * Registers the device with FCM and uploads the token to the backend.
 * Best-effort: never blocks or throws on failure. Uses expo-notifications
 * (expo push / FCM) when configured; skips gracefully otherwise.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(STORAGE_KEY)
    if (done) return

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      }).catch(() => {})
    }

    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync()
      status = req.status
    }
    if (status !== 'granted') return

    const token = await Notifications.getExpoPushTokenAsync().catch(() => null)
    if (!token?.data) return

    await api.post('/fcm/register', {
      token: token.data,
      platform: Platform.OS,
    })
    await AsyncStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // Notifications are best-effort; never break the session for push setup.
  }
}
