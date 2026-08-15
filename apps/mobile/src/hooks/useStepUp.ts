import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { api } from '../config'

export interface StepUpResult {
  actionToken: string | null
  verifying: boolean
  stepUp: (action: string) => Promise<string | null>
}

/**
 * Step-up verification for sensitive actions (releasing money, deleting the
 * account, confirming a booking). Prompts the user for a fresh OTP to their
 * registered mobile, exchanges it for a short-lived action token, and returns
 * that token so the caller can attach it as x-action-token to the guarded API
 * call. Returns null if the user cancels.
 */
export function useStepUp(): StepUpResult {
  const [actionToken, setActionToken] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const stepUp = useCallback(async (action: string): Promise<string | null> => {
    setVerifying(true)
    try {
      const req = await api.post<{ devCode?: string; expiresIn: number }>(`/auth/actions/${action}/request`)
      const code = await new Promise<string | null>((resolve) => {
        Alert.prompt(
          'Confirm it\u2019s you',
          `Enter the verification code sent to your registered mobile (${action.replace(/_/g, ' ')}).`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            { text: 'Verify', onPress: (value?: string) => resolve(value?.trim() ?? null) },
          ],
          'plain-text',
        )
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
  }, [])

  return { actionToken, verifying, stepUp }
}
