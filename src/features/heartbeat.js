/**
 * FR-15 Content Side: Heartbeat Sender
 * - Gửi HEARTBEAT lên background mỗi 30 giây
 * - Kèm theo stats từ các modules khác
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

    // Use window.__extSendMessage (captured in extension context before imports)
    // to avoid "must specify Extension ID" error from web-page module context
    const sendFn = window.__extSendMessage || function(msg, cb) {
      try { chrome.runtime.sendMessage(msg, cb); } catch(e) {}
    };

    sendFn(
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
 * Cleanup heartbeat
 */
export function cleanupHeartbeat() {
  if (!isInitialized) return;

  try {
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
