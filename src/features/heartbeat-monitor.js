/**
 * FR-15 Background Side: Heartbeat Monitor
 * - Lắng nghe HEARTBEAT từ content
 * - Kiểm tra timeout > 90 giây → coi như mất kết nối
 * - Gửi báo cáo mất kết nối lên backend
 */

import { logger } from '../core/logger.js';
import { apiService } from '../services/api.js';
import { addToOfflineQueue, flushOfflineQueue } from './offline-queue.js';

const heartbeatMap = {}; // { [sessionId]: { lastHeartbeat, tabId, stats } }
let monitoringActive = false;
let monitorIntervalId = null;

const HEARTBEAT_TIMEOUT = 90000; // 90 seconds
const MONITOR_INTERVAL = 60000; // 60 seconds
const DISCONNECT_REASON = 'no_heartbeat';

/**
 * Xử lý heartbeat nhận được từ content
 */
export function handleHeartbeat(data) {
  try {
    const { sessionId, tabId, timestamp, stats } = data;

    if (!sessionId) {
      logger.warn('Heartbeat received without sessionId');
      return;
    }

    if (!heartbeatMap[sessionId]) {
      heartbeatMap[sessionId] = {
        tabId,
        stats: {},
        connectionStatus: 'connected',
        lastDisconnectTime: null,
        lastHeartbeat: timestamp || Date.now(), // initialize to avoid NaN on first check
      };
    }

    heartbeatMap[sessionId].lastHeartbeat = timestamp;
    heartbeatMap[sessionId].tabId = tabId;
    heartbeatMap[sessionId].stats = stats;

    // Nếu trước đó bị mất kết nối, giờ quay lại → flush offline queue
    if (heartbeatMap[sessionId].connectionStatus === 'disconnected') {
      logger.info('Connection restored for session', { sessionId });
      heartbeatMap[sessionId].connectionStatus = 'connected';

      // Flush offline queue nếu có
      flushOfflineQueue(sessionId).catch((error) => {
        logger.warn('Failed to flush offline queue on reconnect', error.message);
      });
    }

    logger.debug('Heartbeat received', {
      sessionId,
      tabId,
      timestamp,
      statsKeys: Object.keys(stats || {}),
    });
  } catch (error) {
    logger.error('Error handling heartbeat', error.message);
  }
}

/**
 * Kiểm tra timeout heartbeat
 */
function checkHeartbeatTimeout() {
  const now = Date.now();

  Object.entries(heartbeatMap).forEach(([sessionId, heartbeatData]) => {
    const timeSinceLastBeat = now - heartbeatData.lastHeartbeat;

    if (timeSinceLastBeat > HEARTBEAT_TIMEOUT) {
      // Mất kết nối
      if (heartbeatData.connectionStatus !== 'disconnected') {
        logger.error('Connection lost - no heartbeat', {
          sessionId,
          lastHeartbeat: heartbeatData.lastHeartbeat,
          timeSinceLastBeat,
        });

        heartbeatData.connectionStatus = 'disconnected';
        heartbeatData.lastDisconnectTime = now;

        // Gửi báo cáo mất kết nối lên backend
        reportDisconnection(sessionId, heartbeatData).catch((error) => {
          logger.warn('Failed to report disconnection', error.message);
          // Thêm vào queue nếu backend offline
          addToOfflineQueue(sessionId, {
            type: 'DISCONNECTION_REPORT',
            severity: 'high',
            feature: 'heartbeat-monitor',
            details: {
              sessionId,
              tabId: heartbeatData.tabId,
              reason: DISCONNECT_REASON,
              timestamp: now,
            },
          });
        });
      }
    }
  });
}

/**
 * Báo cáo mất kết nối lên backend
 */
async function reportDisconnection(sessionId, heartbeatData) {
  try {
    const payload = {
      sessionId,
      tabId: heartbeatData.tabId,
      reason: DISCONNECT_REASON,
      timestamp: Date.now(),
    };

    logger.info('Reporting disconnection to backend', payload);

    await apiService.reportDisconnection(payload);

    logger.info('Disconnection reported successfully', { sessionId });
  } catch (error) {
    logger.error('Failed to report disconnection', error.message);
    throw error;
  }
}

/**
 * Khởi tạo entry heartbeat cho session ngay khi tạo session.
 * Gọi trước startHeartbeatMonitoring() để tránh false-timeout trong
 * lần check đầu tiên (khi content chưa kịp gửi heartbeat đầu tiên).
 */
export function initHeartbeatSession(sessionId, tabId) {
  if (!sessionId) return;
  heartbeatMap[sessionId] = {
    tabId,
    stats: {},
    connectionStatus: 'connected',
    lastDisconnectTime: null,
    lastHeartbeat: Date.now(), // seed ngay khi tạo session
  };
  logger.info('Heartbeat session initialized', { sessionId, tabId });
}

/**
 * Khởi tạo heartbeat monitoring
 */
export function startHeartbeatMonitoring() {
  if (monitoringActive) {
    logger.debug('Heartbeat monitoring already active');
    return;
  }

  try {
    // Thiết lập interval kiểm tra timeout
    monitorIntervalId = setInterval(checkHeartbeatTimeout, MONITOR_INTERVAL);

    monitoringActive = true;
    logger.info('Heartbeat monitoring started', {
      monitorInterval: MONITOR_INTERVAL,
      heartbeatTimeout: HEARTBEAT_TIMEOUT,
    });
  } catch (error) {
    logger.error('Failed to start heartbeat monitoring', error.message);
    throw error;
  }
}

/**
 * Dừng heartbeat monitoring
 */
export function stopHeartbeatMonitoring() {
  if (!monitoringActive) return;

  try {
    if (monitorIntervalId) {
      clearInterval(monitorIntervalId);
      monitorIntervalId = null;
    }

    monitoringActive = false;
    logger.info('Heartbeat monitoring stopped');
  } catch (error) {
    logger.error('Failed to stop heartbeat monitoring', error.message);
  }
}

/**
 * Lấy status heartbeat
 */
export function getHeartbeatStatus() {
  const status = {};

  Object.entries(heartbeatMap).forEach(([sessionId, data]) => {
    const timeSinceLastBeat = Date.now() - data.lastHeartbeat;
    status[sessionId] = {
      tabId: data.tabId,
      connectionStatus: data.connectionStatus,
      lastHeartbeat: data.lastHeartbeat,
      timeSinceLastBeat,
      isConnected: timeSinceLastBeat <= HEARTBEAT_TIMEOUT,
      lastDisconnectTime: data.lastDisconnectTime,
    };
  });

  return status;
}

/**
 * Reset heartbeat data cho session
 */
export function resetHeartbeatData(sessionId) {
  if (heartbeatMap[sessionId]) {
    delete heartbeatMap[sessionId];
    logger.debug('Heartbeat data reset', { sessionId });
  }
}

/**
 * Clear all heartbeat data
 */
export function clearAllHeartbeatData() {
  Object.keys(heartbeatMap).forEach((sessionId) => {
    delete heartbeatMap[sessionId];
  });
  logger.debug('All heartbeat data cleared');
}
