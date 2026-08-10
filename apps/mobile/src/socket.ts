import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE_URL } from './config'

const API_HOST = API_BASE_URL.replace(/\/api\/v1$/, '')

let socket: Socket | null = null

export function getTrackingSocket(): Socket {
  if (!socket) {
    socket = io(`${API_HOST}/tracking`, { transports: ['websocket'] })
  }
  return socket
}
