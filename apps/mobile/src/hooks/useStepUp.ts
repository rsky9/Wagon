import { useCallback, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../config'
import { prompt } from '../components/Prompt'

export interface StepUpResult {
  actionToken: string | null
  verifying: boolean
  biometricAvailable: boolean
  stepUp: (action: string) => Promise<string | null>
}

/**
 * Step-up verification for sensitive actions (releasing money, accepting a load,
 * confirming a booking, deleting the account).
 *
 * Two-factor on-device: where the device supports it, a biometric scan (face /
 * fingerprint) confirms the device owner is physically present, then a fresh OTP
 * to the registered mobile is exchanged for a short-lived action token. If
 * biometrics aren't available, OTP alone gates the action.
 *
 * The caller attaches the returned token as x-action-token to the guarded API
 * call. Returns null if the user cancels.
 */
export function useStepUp(): StepUpResult {
  const [actionToken, setActionToken] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)

  const checkBiometric = useCallback(async () => {
    try {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      return hasHardware && enrolled
    } catch {
      return false
    }
  }, [])

  const stepUp = useCallback(async (action: string): Promise<string | null> => {
    setVerifying(true)
    try {
      const canBiometric = await checkBiometric()
      setBiometricAvailable(canBiometric)

      // Factor 1 (optional, opt-in): biometric presence of the device owner.
      const biometricPref = await AsyncStorage.getItem('wagon_biometric').catch(() => null)
      if (canBiometric && biometricPref === 'on') {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: `Unlock to ${action.replace(/_/g, ' ')}`,
          cancelLabel: 'Use OTP only',
          disableDeviceFallback: true,
        })
        if (!auth.success) return null
      }

      // Factor 2 (always): a fresh OTP to the registered mobile.
      const req = await api.post<{ devCode?: string }>(`/auth/actions/${action}/request`)
      const code = await prompt({
        title: 'Confirm it\u2019s you',
        message: `Enter the verification code sent to your registered mobile (${action.replace(/_/g, ' ')}).`,
        placeholder: '4-digit code',
        confirmText: 'Verify',
        keyboardType: 'numeric',
      })
      if (!code) return null
      const verified = await api.post<{ actionToken: string }>(`/auth/actions/${action}/verify`, { code })
      setActionToken(verified.actionToken)
      return verified.actionToken
    } catch (e) {
      Alert.alert('Verification failed', e instanceof Error ? e.message : 'Could not verify')
      return null
    } finally {
      setVerifying(false)
    }
  }, [checkBiometric])

  return { actionToken, verifying, biometricAvailable, stepUp }
}
