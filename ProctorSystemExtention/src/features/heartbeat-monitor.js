/**
 * FR-15 Background Side: Heartbeat Monitor
 * - Lắng nghe HEARTBEAT từ content
 * - Kiểm tra timeout > 90 giây → coi như mất kết nối
 * - Gửi báo cáo mất kết nối lên backend
 *
 * MV3 Fixes:
 * 🔴 Fix #1 — chrome.alarms thay setInterval:
 *   setInterval bị xóa khi Chrome terminate service worker sau ~30s idle.
 *   chrome.alarms tồn tại độc lập với vòng đời SW, tự wake-up SW khi fire.
 *
 * 🔴 Fix #2 — Persist heartbeatMap vào chrome.storage.session:
 *   heartbeatMap = {} mỗi lần SW restart → toàn bộ context session mất.
 *   chrome.storage.session tồn tại suốt phiên làm việc của browser (không
 *   bị xóa khi SW sleep/wake), đảm bảo không bỏ lỡ khoảng mất giám sát.
 */

import { logger } from '../core/logger.js';
import { apiService } from '../services/api.js';
import { addToOfflineQueue, flushOfflineQueue } from './offline-queue.js';

// In-memory mirror — luôn được sync từ/về chrome.storage.session
// Không dùng trực tiếp mà luôn đọc qua restoreHeartbeatMap() trước khi dùng
let heartbeatMap = {}; // { [sessionId]: { lastHeartbeat, tabId, stats, connectionStatus, lastDisconnectTime } }

const HEARTBEAT_TIMEOUT = 150000; // 2.5 phút — phản ánh đúng thực tế
const ALARM_NAME = 'proctor-heartbeat-check';
const ALARM_PERIOD_MIN = 1;               // chrome.alarms tối thiểu 1 phút
const STORAGE_KEY = 'heartbeat_map'; // key trong chrome.storage.session
const DISCONNECT_REASON = 'no_heartbeat';

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Ghi heartbeatMap vào chrome.storage.session.
 * Gọi sau mỗi mutation để đảm bảo SW restart không mất data.
 */
async function saveHeartbeatMap() {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: heartbeatMap });
  } catch (error) {
    logger.warn('[HB-Monitor] Failed to persist heartbeatMap', error.message);
  }
}

/**
 * Load heartbeatMap từ chrome.storage.session vào bộ nhớ.
 * GỌI ĐẦU TIÊN trước mỗi thao tác đọc/ghi trong các handler,
 * đặc biệt là khi alarm fire (SW vừa wake up, heartbeatMap = {}).
 */
export async function restoreHeartbeatMap() {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    if (result[STORAGE_KEY] && typeof result[STORAGE_KEY] === 'object') {
      heartbeatMap = result[STORAGE_KEY];
      logger.info('[HB-Monitor] HeartbeatMap restored from storage', {
        sessions: Object.keys(heartbeatMap).length,
      });
    }
  } catch (error) {
    logger.warn('[HB-Monitor] Failed to restore heartbeatMap from storage', error.message);
  }
}

// ─── Core handlers ────────────────────────────────────────────────────────────

/**
 * Xử lý heartbeat nhận được từ content script.
 * Cập nhật lastHeartbeat và persist ngay vào storage.
 */
export async function handleHeartbeat(data) {
  try {
    await restoreHeartbeatMap();
    const { sessionId, tabId, timestamp, stats } = data;

    if (!sessionId) {
      logger.warn('[HB-Monitor] Heartbeat received without sessionId');
      return;
    }

    if (!heartbeatMap[sessionId]) {
      heartbeatMap[sessionId] = {
        tabId,
        stats: {},
        connectionStatus: 'connected',
        lastDisconnectTime: null,
        lastHeartbeat: timestamp || Date.now(),
      };
    }

    heartbeatMap[sessionId].lastHeartbeat = timestamp;
    heartbeatMap[sessionId].tabId = tabId;
    heartbeatMap[sessionId].stats = stats;

    // Nếu trước đó bị mất kết nối, giờ quay lại → flush offline queue
    if (heartbeatMap[sessionId].connectionStatus === 'disconnected') {
      logger.info('[HB-Monitor] Connection restored for session', { sessionId });
      heartbeatMap[sessionId].connectionStatus = 'connected';

      flushOfflineQueue(sessionId).catch((error) => {
        logger.warn('[HB-Monitor] Failed to flush offline queue on reconnect', error.message);
      });
    }

    logger.debug('[HB-Monitor] Heartbeat received', {
      sessionId,
      tabId,
      timestamp,
      statsKeys: Object.keys(stats || {}),
    });

    // Persist ngay sau mỗi heartbeat để không mất data khi SW bị kill
    await saveHeartbeatMap();
  } catch (error) {
    logger.error('[HB-Monitor] Error handling heartbeat', error.message);
  }
}

/**
 * Kiểm tra timeout heartbeat — được gọi mỗi khi alarm 'proctor-heartbeat-check' fire.
 * SW có thể vừa wake up, nên luôn reload từ storage trước khi check.
 */
async function checkHeartbeatTimeout() {
  const now = Date.now();
  let mapChanged = false;

  for (const [sessionId, heartbeatData] of Object.entries(heartbeatMap)) {
    const timeSinceLastBeat = now - heartbeatData.lastHeartbeat;

    if (timeSinceLastBeat > HEARTBEAT_TIMEOUT) {
      // Mất kết nối — chỉ report lần đầu (tránh spam)
      if (heartbeatData.connectionStatus !== 'disconnected') {
        logger.error('[HB-Monitor] Connection lost - no heartbeat', {
          sessionId,
          lastHeartbeat: heartbeatData.lastHeartbeat,
          timeSinceLastBeat,
        });

        heartbeatMap[sessionId].connectionStatus = 'disconnected';
        heartbeatMap[sessionId].lastDisconnectTime = now;
        mapChanged = true;

        // Báo lên backend (fire-and-forget với offline fallback)
        reportDisconnection(sessionId, heartbeatData).catch((error) => {
          logger.warn('[HB-Monitor] Failed to report disconnection', error.message);
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
  }

  // Chỉ ghi storage nếu thực sự có thay đổi
  if (mapChanged) {
    await saveHeartbeatMap();
  }
}

/**
 * Báo cáo mất kết nối lên backend.
 */
async function reportDisconnection(sessionId, heartbeatData) {
  const payload = {
    sessionId,
    tabId: heartbeatData.tabId,
    reason: DISCONNECT_REASON,
    timestamp: Date.now(),
    stats: heartbeatData.stats || {},
  };

  logger.info('[HB-Monitor] Reporting disconnection to backend', payload);
  await apiService.reportDisconnection(payload);
  logger.info('[HB-Monitor] Disconnection reported successfully', { sessionId });
}

// ─── Alarm integration (gọi từ background.js) ────────────────────────────────

/**
 * Entry point cho chrome.alarms.onAlarm khi name === ALARM_NAME.
 * Luôn reload heartbeatMap từ storage trước khi check (SW có thể vừa wake up).
 */
export async function handleHeartbeatAlarm() {
  await restoreHeartbeatMap();
  await checkHeartbeatTimeout();
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Khởi tạo entry heartbeat cho session ngay khi tạo session.
 * Gọi trước startHeartbeatMonitoring() để tránh false-timeout trong
 * lần check đầu tiên (khi content chưa kịp gửi heartbeat đầu tiên).
 */
export async function initHeartbeatSession(sessionId, tabId) {
  if (!sessionId) return;
  heartbeatMap[sessionId] = {
    tabId,
    stats: {},
    connectionStatus: 'connected',
    lastDisconnectTime: null,
    lastHeartbeat: Date.now(),
  };
  logger.info('[HB-Monitor] Heartbeat session initialized', { sessionId, tabId });
  await saveHeartbeatMap();
}

/**
 * Bắt đầu heartbeat monitoring bằng chrome.alarms.
 * Idempotent — không tạo duplicate nếu alarm đã tồn tại.
 */
export async function startHeartbeatMonitoring() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) {
    logger.debug('[HB-Monitor] Heartbeat alarm already active, skipping create');
    return;
  }

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
  logger.info('[HB-Monitor] Heartbeat monitoring started (alarm)', {
    alarmName: ALARM_NAME,
    periodMinutes: ALARM_PERIOD_MIN,
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
  });
}

/**
 * Dừng heartbeat monitoring — xóa alarm.
 */
export async function stopHeartbeatMonitoring() {
  await chrome.alarms.clear(ALARM_NAME);
  logger.info('[HB-Monitor] Heartbeat monitoring stopped (alarm cleared)');
}

/**
 * Lấy trạng thái heartbeat hiện tại (dùng in-memory mirror).
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
 * Reset heartbeat data cho một session cụ thể.
 */
export async function resetHeartbeatData(sessionId) {
  if (heartbeatMap[sessionId]) {
    delete heartbeatMap[sessionId];
    logger.debug('[HB-Monitor] Heartbeat data reset', { sessionId });
    await saveHeartbeatMap();
  }
}

/**
 * Xóa toàn bộ heartbeat data (khi kết thúc giám sát).
 */
export async function clearAllHeartbeatData() {
  Object.keys(heartbeatMap).forEach((sid) => delete heartbeatMap[sid]);
  logger.debug('[HB-Monitor] All heartbeat data cleared');
  await saveHeartbeatMap();
}
