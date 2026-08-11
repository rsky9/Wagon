import { createApiClient } from '@wagon/api-client'

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4020/api/v1'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => accessToken,
})
