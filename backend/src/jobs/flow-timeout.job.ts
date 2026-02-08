import { prisma } from '../config/database.js'

/**
 * Flow Timeout Job
 * Runs every 30 seconds and closes flow sessions that have been inactive
 * for longer than the configured timeout (default: 5 minutes)
 * Sends a configurable timeout message before closing.
 */

const DEFAULT_TIMEOUT_MINUTES = 5
const DEFAULT_TIMEOUT_MESSAGE = 'Sessao encerrada por inatividade. Envie uma mensagem para iniciar novamente.'
let isRunning = false
let intervalId: NodeJS.Timeout | null = null

// Lazy import to avoid circular dependency
let _baileysManager: any = null
async function getBaileysManager() {
  if (!_baileysManager) {
    const server = await import('../server.js')
    _baileysManager = server.baileysManager
  }
  return _baileysManager
}

async function checkTimeouts(): Promise<void> {
  if (isRunning) return
  isRunning = true

  try {
    // Find all active sessions that are waiting for input
    const activeSessions = await prisma.flowSession.findMany({
      where: {
        isActive: true,
        waitingInput: true,
      },
      include: {
        flow: {
          select: { settings: true },
        },
      },
    })

    if (activeSessions.length === 0) {
      isRunning = false
      return
    }

    const now = new Date()

    for (const session of activeSessions) {
      try {
        // Get timeout from flow settings or use default
        const settings = (session.flow.settings || {}) as Record<string, any>
        const timeoutMinutes = settings.inactivityTimeout || DEFAULT_TIMEOUT_MINUTES

        // Check if session has been inactive for too long
        const lastActivity = session.lastActivity || session.createdAt
        const inactiveMs = now.getTime() - lastActivity.getTime()
        const inactiveMinutes = inactiveMs / (1000 * 60)

        if (inactiveMinutes >= timeoutMinutes) {
          // Send timeout message before closing
          const timeoutMessage = settings.timeoutMessage || DEFAULT_TIMEOUT_MESSAGE
          try {
            const manager = await getBaileysManager()
            if (manager) {
              await manager.sendTextMessage(session.instanceId, session.remoteJid, timeoutMessage)
            }
          } catch (sendErr: any) {
            console.error(`[FlowTimeout] Failed to send timeout message for session ${session.id}:`, sendErr.message)
          }

          // Close the session
          await prisma.flowSession.update({
            where: { id: session.id },
            data: {
              isActive: false,
              waitingInput: false,
              completedAt: now,
              lastActivity: now,
            },
          })

          console.log(
            `[FlowTimeout] Session ${session.id} closed - inactive ${inactiveMinutes.toFixed(1)} min (timeout: ${timeoutMinutes} min) - jid: ${session.remoteJid}`
          )
        }
      } catch (error: any) {
        console.error(`[FlowTimeout] Error processing session ${session.id}:`, error.message)
      }
    }
  } catch (error: any) {
    console.error('[FlowTimeout] Error in checkTimeouts:', error.message)
  } finally {
    isRunning = false
  }
}

export function startFlowTimeoutJob(): void {
  console.log('[FlowTimeout] Starting flow timeout job (checks every 30s)...')
  intervalId = setInterval(checkTimeouts, 30 * 1000)
  // First run after 15 seconds
  setTimeout(checkTimeouts, 15 * 1000)
}

export function stopFlowTimeoutJob(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[FlowTimeout] Flow timeout job stopped')
  }
}
