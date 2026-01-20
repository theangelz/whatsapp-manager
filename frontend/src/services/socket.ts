import { io, Socket } from 'socket.io-client'

// Usa variável de ambiente ou fallback para window.location.origin
const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      path: '/socket.io/',
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message)
    })
  }
  return socket
}

export function connectSocket() {
  const sock = getSocket()
  if (!sock.connected) {
    sock.connect()
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
  }
}

export function joinInstance(instanceId: string) {
  const sock = getSocket()
  sock.emit('join-instance', instanceId)
}

export function leaveInstance(instanceId: string) {
  const sock = getSocket()
  sock.emit('leave-instance', instanceId)
}
