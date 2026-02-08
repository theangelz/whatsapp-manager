import { prisma } from '../config/database.js'
import { CloudAPIProvider } from '../providers/cloud-api/cloud-api.provider.js'

/**
 * Window Notifier Job
 * Runs every minute and checks if any subscribers need to be notified
 * about their expiring 24h window (5 minutes before it closes)
 */

let isRunning = false

const NOTIFY_AFTER_MINUTES = 5 // Notify 5 minutes AFTER window closes

/**
 * Check 24h window status for a phone number
 */
async function getWindowStatus(companyId: string, phoneNumber: string): Promise<{
  open: boolean
  closedAt?: Date
  minutesSinceClosed?: number
}> {
  const contact = await prisma.contact.findUnique({
    where: {
      companyId_phoneNumber: {
        companyId,
        phoneNumber,
      },
    },
    select: { lastInboundAt: true },
  })

  if (!contact?.lastInboundAt) {
    return { open: false }
  }

  const now = new Date()
  const closedAt = new Date(contact.lastInboundAt.getTime() + 24 * 60 * 60 * 1000) // 24h after last message
  const isOpen = now < closedAt
  const minutesSinceClosed = !isOpen ? (now.getTime() - closedAt.getTime()) / (1000 * 60) : 0

  return { open: isOpen, closedAt, minutesSinceClosed }
}

// Default template for window notification (must be approved in Meta)
// Template UTILITY with QUICK_REPLY buttons for window renewal
const DEFAULT_WINDOW_TEMPLATE = 'janela_renovar'
const DEFAULT_WINDOW_TEMPLATE_LANG = 'pt_BR'

/**
 * Send window renewal notification using a template (works outside 24h window)
 * Templates are pre-approved by Meta and can be sent anytime
 * When user clicks a QUICK_REPLY button, it counts as inbound message and reopens the window
 */
async function sendWindowNotification(
  instance: any,
  phoneNumber: string,
  templateName: string = DEFAULT_WINDOW_TEMPLATE,
  templateLang: string = DEFAULT_WINDOW_TEMPLATE_LANG
): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (instance.channel !== 'CLOUD_API' && instance.channel !== 'COEXISTENCE') {
    return { success: false, error: 'Instance must be Cloud API or Coexistence' }
  }

  try {
    const cloudApi = new CloudAPIProvider(instance)

    // Send template message (works outside 24h window)
    // When user responds to the template, the window reopens
    const result = await cloudApi.sendTemplateMessage(
      phoneNumber,
      templateName,
      templateLang,
      [] // No body parameters needed for simple notification template
    )

    return { success: true, messageId: result?.messages?.[0]?.id }
  } catch (error: any) {
    console.error('[WindowNotifier] Error sending notification:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Check and notify subscribers whose windows are about to expire
 */
async function checkAndNotify(): Promise<void> {
  if (isRunning) return
  isRunning = true

  try {
    // Find all active subscribers
    const subscribers = await prisma.windowSubscriber.findMany({
      where: { isActive: true },
      include: { instance: true },
    })

    if (subscribers.length === 0) {
      isRunning = false
      return
    }

    const now = new Date()

    for (const subscriber of subscribers) {
      try {
        // Get window status
        const windowStatus = await getWindowStatus(subscriber.companyId, subscriber.phoneNumber)

        // Skip if window is still open
        if (windowStatus.open) {
          continue
        }

        // Check if window closed within NOTIFY_AFTER_MINUTES (5 minutes ago)
        // We only notify if closed between 5-10 minutes ago to avoid spamming
        if (!windowStatus.minutesSinceClosed ||
            windowStatus.minutesSinceClosed < NOTIFY_AFTER_MINUTES ||
            windowStatus.minutesSinceClosed > NOTIFY_AFTER_MINUTES + 5) {
          // Not in the notification window (5-10 min after closing)
          continue
        }

        // Check if already notified after this window closed
        if (subscriber.lastNotified && windowStatus.closedAt) {
          // If notified after the window closed, skip
          if (subscriber.lastNotified >= windowStatus.closedAt) {
            continue
          }
        }

        // Check if instance is connected
        if (subscriber.instance.status !== 'CONNECTED') {
          console.log(`[WindowNotifier] ${subscriber.phoneNumber} - Instance not connected, skipping`)
          continue
        }

        console.log(`[WindowNotifier] ${subscriber.phoneNumber} - Window closed ${windowStatus.minutesSinceClosed?.toFixed(1)} min ago, sending notification`)

        // Send notification
        const result = await sendWindowNotification(subscriber.instance, subscriber.phoneNumber)

        if (result.success) {
          await prisma.windowSubscriber.update({
            where: { id: subscriber.id },
            data: { lastNotified: now },
          })
          console.log(`[WindowNotifier] ${subscriber.phoneNumber} - Notification sent successfully`)
        } else {
          console.log(`[WindowNotifier] ${subscriber.phoneNumber} - Failed: ${result.error}`)
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error: any) {
        console.error(`[WindowNotifier] Error processing ${subscriber.phoneNumber}:`, error.message)
      }
    }
  } catch (error: any) {
    console.error('[WindowNotifier] Error in checkAndNotify:', error.message)
  } finally {
    isRunning = false
  }
}

let intervalId: NodeJS.Timeout | null = null

/**
 * Start the window notifier job
 * Runs every minute to check for subscribers whose windows are expiring
 */
export function startWindowNotifierJob(): void {
  console.log('[WindowNotifier] Starting window notifier job (checks every minute)...')

  // Run every minute
  intervalId = setInterval(checkAndNotify, 60 * 1000)

  // Also run once after 10 seconds (give time for DB to be ready)
  setTimeout(checkAndNotify, 10 * 1000)
}

/**
 * Stop the window notifier job
 */
export function stopWindowNotifierJob(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[WindowNotifier] Window notifier job stopped')
  }
}

export { sendWindowNotification, getWindowStatus }
