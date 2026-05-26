/**
 * FR-15 Content Side: Heartbeat Sender
 * - Gửi HEARTBEAT lên background mỗi 30 giây
 * - Kèm theo stats từ các modules khác
 * - Gửi SESSION_END trước khi cleanup để background không báo false-disconnection
 */

import { logger } from '../core/logger.js';
import { getAwayStats } from './tab-switch-detector.js';
import { getFullscreenStats } from './fullscreen-monitor.js';
import { getDevtoolsStats } from './devtools-detector.js';
import { getBlockActionsCount } from './block-actions.js';

let isInitialized = false;
let intervalId = null;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

/**
 * Helper dùng chung: lấy hàm gửi message lên background.
 * Dùng window.__extSendMessage (được inject bởi background) để tránh lỗi
 * "must specify Extension ID" khi gọi từ web-page module context.
 */
function getSendFn() {
  return window.__extSendMessage || function (msg, cb) {
    try { chrome.runtime.sendMessage(msg, cb); } catch (e) { }
  };
}

/**
 * Gửi heartbeat lên background
 */
function sendHeartbeat() {
  if (!window.__proctoringSession) {
    logger.debug('No active session, skipping heartbeat');
    return;
  }

  try {
    const now = Date.now();
    const stats = {
      awayStats: getAwayStats(),
      fullscreenStats: getFullscreenStats(),
      devtoolsStats: getDevtoolsStats(),
      blockActionsCount: getBlockActionsCount(),
    };

    const payload = {
      sessionId: window.__proctoringSession.sessionId,
      tabId: window.__proctoringSession.tabId,
      timestamp: now,
      stats,
    };

    getSendFn()(
      { type: 'HEARTBEAT', data: payload },
      (response) => {
        if (chrome.runtime?.lastError) {
          logger.debug('Heartbeat send failed', chrome.runtime.lastError.message);
        } else {
          logger.debug('Heartbeat sent successfully', { timestamp: now });
        }
      }
    );
  } catch (error) {
    logger.error('Error sending heartbeat', error.message);
  }
}

/**
 * Khởi tạo heartbeat
 */
export function initHeartbeat() {
  if (isInitialized) {
    logger.debug('Heartbeat already initialized');
    return;
  }

  try {
    // Gửi heartbeat ngay lập tức
    sendHeartbeat();

    // Thiết lập interval gửi heartbeat
    intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    isInitialized = true;
    logger.info('Heartbeat initialized', { interval: HEARTBEAT_INTERVAL });
  } catch (error) {
    logger.error('Failed to init heartbeat', error.message);
    throw error;
  }
}

/**
 * Cleanup heartbeat.
 * Gửi SESSION_END lên background TRƯỚC khi dừng interval để background
 * có thể xóa entry khỏi heartbeatMap — tránh báo false-disconnection sau 150s.
 */
export function cleanupHeartbeat() {
  if (!isInitialized) return;

  try {
    // Notify background ngay lập tức trước khi dừng interval
    const sessionId = window.__proctoringSession?.sessionId;
    if (sessionId) {
      getSendFn()(
        { type: 'SESSION_END', data: { sessionId } },
        () => { chrome.runtime?.lastError; } // consume lastError silently
      );
      logger.debug('SESSION_END sent to background', { sessionId });
    }

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    isInitialized = false;
    logger.info('Heartbeat cleanup complete');
  } catch (error) {
    logger.error('Failed to cleanup heartbeat', error.message);
  }
}
