import { io, Socket } from 'socket.io-client'
import { API_BASE_URL, getAccessToken } from './config'

const API_HOST = API_BASE_URL.replace(/\/api\/v1$/, '')

let socket: Socket | null = null

/**
 * Tracking socket singleton. Authenticates with the CURRENT access token so a
 * rotation or re-login never leaves a stale/previous-user session live.
 */
export function getTrackingSocket(): Socket {
  if (!socket) {
    socket = io(`${API_HOST}/tracking`, {
      transports: ['websocket'],
      auth: { token: getAccessToken() },
    })
    // Re-auth on token changes (refresh rotation) so live tracking survives
    // an access-token refresh without leaking a previous user's data.
    socket.on('reconnect_attempt', () => {
      if (socket) socket.auth = { token: getAccessToken() }
    })
  } else {
    // If the token changed since the socket was created, refresh the auth payload.
    socket.auth = { token: getAccessToken() }
  }
  return socket
}

/** Disconnect and drop the singleton (called on logout). */
export function resetTrackingSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
