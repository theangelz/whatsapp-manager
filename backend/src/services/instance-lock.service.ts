import { prisma } from '../config/database.js'
import { InstanceLockStatus } from '@prisma/client'

const MAX_CONSECUTIVE_ERRORS = 5

export class InstanceLockService {
  /**
   * Get or create an instance lock record
   */
  async getOrCreateLock(instanceId: string) {
    let lock = await prisma.instanceLock.findUnique({
      where: { instanceId },
    })

    if (!lock) {
      lock = await prisma.instanceLock.create({
        data: {
          instanceId,
          status: 'LIVRE',
        },
      })
    }

    return lock
  }

  /**
   * Check if an instance is available for sending
   */
  async isAvailable(instanceId: string): Promise<boolean> {
    const lock = await this.getOrCreateLock(instanceId)
    return lock.status === 'LIVRE'
  }

  /**
   * Acquire lock for sending (LIVRE -> EM_USO)
   */
  async acquireLock(instanceId: string, lockedBy: string, reason?: string): Promise<boolean> {
    const lock = await this.getOrCreateLock(instanceId)

    if (lock.status !== 'LIVRE') {
      return false
    }

    await prisma.instanceLock.update({
      where: { instanceId },
      data: {
        status: 'EM_USO',
        lockedAt: new Date(),
        lockedBy,
        lockedReason: reason,
      },
    })

    return true
  }

  /**
   * Release lock after successful send (EM_USO -> LIVRE)
   */
  async releaseLock(instanceId: string): Promise<void> {
    await prisma.instanceLock.update({
      where: { instanceId },
      data: {
        status: 'LIVRE',
        lockedAt: null,
        lockedBy: null,
        lockedReason: null,
        lastSendAt: new Date(),
        sendCount: { increment: 1 },
        errorCount: 0, // Reset error count on success
        lastError: null,
      },
    })
  }

  /**
   * Record an error during send
   */
  async recordError(instanceId: string, error: string): Promise<void> {
    const lock = await this.getOrCreateLock(instanceId)
    const newErrorCount = lock.errorCount + 1

    if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
      // Block instance after too many consecutive errors
      await prisma.instanceLock.update({
        where: { instanceId },
        data: {
          status: 'BLOQUEADA',
          errorCount: newErrorCount,
          lastError: error,
          lockedReason: `Bloqueada após ${newErrorCount} erros consecutivos`,
        },
      })
    } else {
      // Release lock but increment error count
      await prisma.instanceLock.update({
        where: { instanceId },
        data: {
          status: 'LIVRE',
          lockedAt: null,
          lockedBy: null,
          errorCount: newErrorCount,
          lastError: error,
        },
      })
    }
  }

  /**
   * Manually unblock an instance (BLOQUEADA -> LIVRE)
   */
  async unblock(instanceId: string): Promise<void> {
    await prisma.instanceLock.update({
      where: { instanceId },
      data: {
        status: 'LIVRE',
        lockedAt: null,
        lockedBy: null,
        lockedReason: null,
        errorCount: 0,
        lastError: null,
      },
    })
  }

  /**
   * Get lock status for an instance
   */
  async getStatus(instanceId: string) {
    return this.getOrCreateLock(instanceId)
  }

  /**
   * Get all locks for a company's instances
   */
  async getCompanyLocks(companyId: string) {
    const instances = await prisma.instance.findMany({
      where: { companyId, isActive: true },
      include: { instanceLock: true },
    })

    return instances.map((instance) => ({
      instanceId: instance.id,
      instanceName: instance.name,
      channel: instance.channel,
      lock: instance.instanceLock,
    }))
  }

  /**
   * Force release all stale locks (locks held for more than 5 minutes)
   */
  async releaseStaleLocksLocks(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const result = await prisma.instanceLock.updateMany({
      where: {
        status: 'EM_USO',
        lockedAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: 'LIVRE',
        lockedAt: null,
        lockedBy: null,
        lockedReason: null,
      },
    })

    return result.count
  }
}

export const instanceLockService = new InstanceLockService()
