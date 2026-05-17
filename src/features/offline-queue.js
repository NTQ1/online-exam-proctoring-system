/**
 * Offline Queue Manager
 * - Lưu logs khi backend offline
 * - Flush queue khi kết nối phục hồi
 * - Persistent qua chrome.storage.local
 */

import { logger } from '../core/logger.js';
import { apiService } from '../services/api.js';

const QUEUE_STORAGE_KEY = 'offline_queue';

/**
 * Lấy queue từ storage
 */
async function getQueueFromStorage(sessionId) {
  try {
    const data = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
    const queue = data[QUEUE_STORAGE_KEY] || {};
    return queue[sessionId] || null;
  } catch (error) {
    logger.error('Failed to get queue from storage', error.message);
    return null;
  }
}

/**
 * Lưu queue vào storage
 */
async function saveQueueToStorage(sessionId, queueData) {
  try {
    const data = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
    const queues = data[QUEUE_STORAGE_KEY] || {};
    queues[sessionId] = queueData;
    await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: queues });
  } catch (error) {
    logger.error('Failed to save queue to storage', error.message);
  }
}

/**
 * Thêm log vào queue offline
 */
export async function addToOfflineQueue(sessionId, log) {
  try {
    if (!sessionId) {
      logger.warn('addToOfflineQueue: No sessionId provided');
      return;
    }

    let queueData = await getQueueFromStorage(sessionId);

    if (!queueData) {
      queueData = {
        sessionId,
        logs: [],
        disconnectedAt: Date.now(),
        reconnectedAt: null,
      };
    }

    queueData.logs.push({
      ...log,
      timestamp: log.timestamp || Date.now(),
    });

    await saveQueueToStorage(sessionId, queueData);
    logger.debug('Log added to offline queue', { sessionId, queueSize: queueData.logs.length });
  } catch (error) {
    logger.error('Failed to add log to offline queue', error.message);
  }
}

/**
 * Flush queue lên backend
 */
export async function flushOfflineQueue(sessionId) {
  try {
    if (!sessionId) {
      logger.warn('flushOfflineQueue: No sessionId provided');
      return;
    }

    const queueData = await getQueueFromStorage(sessionId);

    if (!queueData || !queueData.logs || queueData.logs.length === 0) {
      logger.debug('No offline logs to flush', { sessionId });
      return;
    }

    const totalOfflineDuration = Date.now() - queueData.disconnectedAt;
    const payload = {
      sessionId,
      logs: queueData.logs,
      disconnectedAt: queueData.disconnectedAt,
      reconnectedAt: Date.now(),
      totalOfflineDuration,
    };

    logger.info('Flushing offline queue', {
      sessionId,
      logCount: queueData.logs.length,
      duration: totalOfflineDuration,
    });

    // Gửi lên backend
    try {
      const response = await apiService.flushOfflineLogs(payload);
      logger.info('Offline queue flushed successfully', {
        sessionId,
        processedCount: response.processedCount,
      });

      // Clear queue sau khi flush thành công
      await clearOfflineQueue(sessionId);
    } catch (error) {
      logger.error('Failed to flush offline queue to backend', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  } catch (error) {
    logger.error('Error in flushOfflineQueue', error.message);
    throw error;
  }
}

/**
 * Xóa queue
 */
export async function clearOfflineQueue(sessionId) {
  try {
    if (!sessionId) return;

    const data = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
    const queues = data[QUEUE_STORAGE_KEY] || {};
    delete queues[sessionId];

    if (Object.keys(queues).length === 0) {
      await chrome.storage.local.remove(QUEUE_STORAGE_KEY);
    } else {
      await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: queues });
    }

    logger.debug('Offline queue cleared', { sessionId });
  } catch (error) {
    logger.error('Failed to clear offline queue', error.message);
  }
}

/**
 * Lấy stats queue
 */
export async function getOfflineQueueStats(sessionId) {
  try {
    const queueData = await getQueueFromStorage(sessionId);

    if (!queueData) {
      return {
        sessionId,
        logCount: 0,
        disconnectedAt: null,
        reconnectedAt: null,
      };
    }

    return {
      sessionId,
      logCount: queueData.logs.length,
      disconnectedAt: queueData.disconnectedAt,
      reconnectedAt: queueData.reconnectedAt,
      totalOfflineDuration: queueData.reconnectedAt
        ? queueData.reconnectedAt - queueData.disconnectedAt
        : Date.now() - queueData.disconnectedAt,
    };
  } catch (error) {
    logger.error('Failed to get offline queue stats', error.message);
    return null;
  }
}

/**
 * Lấy tất cả offline queues
 */
export async function getAllOfflineQueues() {
  try {
    const data = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
    return data[QUEUE_STORAGE_KEY] || {};
  } catch (error) {
    logger.error('Failed to get all offline queues', error.message);
    return {};
  }
}
