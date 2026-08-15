import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './config'

const STORAGE_KEY = 'wagon_push_registered'

type NavigateFn = (url: string) => void
let navigateToUrl: NavigateFn | null = null
let handlersReady = false

/**
 * Wires up tapped-notification handling. Registers the response listener
 * once, then delegates the notification's `data.url` deep link to the
 * provided navigate callback (the app's navigation ref).
 * Best-effort: never throws; missing params are ignored.
 */
export function setUpNotificationHandlers(navigate: NavigateFn): void {
  navigateToUrl = navigate
  if (handlersReady) return
  handlersReady = true
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data ?? {}
    // The backend deep-links via `data.route` (a stack route or wagon:// URL).
    const url = (data.route ?? data.url ?? '') as string
    if (typeof url === 'string' && url && navigateToUrl) {
      navigateToUrl(url)
    }
  })
}

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
