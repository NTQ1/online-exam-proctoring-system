/**
 * FR-14: Phát hiện DevTools (kiểm tra chênh lệch kích thước)
 * - Kiểm tra: outerWidth - innerWidth > 160px (DevTools bên cạnh)
 * - Hoặc: outerHeight - innerHeight > 100px (DevTools dưới)
 * - Ghi log mỗi 10 giây khi DevTools mở (tránh spam)
 */

import { logger } from '../core/logger.js';

let isInitialized = false;
let intervalId = null;
let wasDevtoolsOpen = false;
let devtoolsOpenCount = 0;
let devtoolsLog = []; // [{ openTime, closeTime, duration }, ...]
let lastDetectionTime = null;

const STORAGE_KEY = 'proctoring_devtools_stats';

/**
 * Tải stats từ sessionStorage
 */
function loadStats() {
  try {
    const currentSessionId = window.__proctoringSession?.sessionId;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    
    if (stored) {
      const data = JSON.parse(stored);
      if (currentSessionId && data.sessionId === currentSessionId) {
        devtoolsOpenCount = data.openCount || 0;
        devtoolsLog = data.log || [];
        logger.debug('Loaded devtools stats for current session', { devtoolsOpenCount });
      } else {
        logger.info('Session ID mismatch for devtools, starting fresh');
        devtoolsOpenCount = 0;
        devtoolsLog = [];
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    logger.warn('Failed to load devtools stats', error.message);
  }
}

/**
 * Lưu stats vào sessionStorage
 */
function saveStats() {
  try {
    const sessionId = window.__proctoringSession?.sessionId;
    if (!sessionId) return;
    
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 
      sessionId,
      openCount: devtoolsOpenCount,
      log: devtoolsLog
    }));
  } catch (error) {
    logger.warn('Failed to save devtools stats', error.message);
  }
}

const CHECK_INTERVAL = 10000; // 10 seconds
const WIDTH_THRESHOLD = 160; // pixels
const HEIGHT_THRESHOLD = 100; // pixels

/**
 * Gửi log violation lên background
 */
function sendViolation(type, data) {
  if (!window.__proctoringSession) return;
  const sendFn = window.__extSendMessage || function(msg, cb) {
    try { chrome.runtime.sendMessage(msg, cb); } catch(e) {}
  };
  try {
    sendFn({
      type: 'LOG_VIOLATION',
      data: { type, severity: 'high', feature: 'devtools-detector', timestamp: Date.now(), details: data },
    }, () => { chrome.runtime?.lastError; });
  } catch (error) {
    logger.debug('Error sending violation', error.message);
  }
}

/**
 * Kiểm tra DevTools
 */
function checkDevTools() {
  try {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;

    const isDevtoolsOpen = widthDiff > WIDTH_THRESHOLD || heightDiff > HEIGHT_THRESHOLD;

    // Log khi trạng thái thay đổi (tránh spam)
    if (isDevtoolsOpen && !wasDevtoolsOpen) {
      // DevTools vừa mở
      devtoolsOpenCount++;
      lastDetectionTime = Date.now();
      wasDevtoolsOpen = true;

      logger.error('DevTools detected - OPEN', {
        widthDiff,
        heightDiff,
        openTime: lastDetectionTime,
        openCount: devtoolsOpenCount,
      });

      sendViolation('DEVTOOLS_OPEN', {
        widthDiff,
        heightDiff,
        openTime: lastDetectionTime,
        openCount: devtoolsOpenCount,
      });
      saveStats();
    } else if (!isDevtoolsOpen && wasDevtoolsOpen) {
      // DevTools vừa đóng
      const closeTime = Date.now();
      const duration = lastDetectionTime ? closeTime - lastDetectionTime : 0;

      logger.warn('DevTools detected - CLOSED', {
        duration,
        closeTime,
        openCount: devtoolsOpenCount,
      });

      if (lastDetectionTime) {
        devtoolsLog.push({
          openTime: lastDetectionTime,
          closeTime,
          duration,
        });
      }

      sendViolation('DEVTOOLS_CLOSE', {
        duration,
        closeTime,
        openCount: devtoolsOpenCount,
      });

      wasDevtoolsOpen = false;
      lastDetectionTime = null;
      saveStats();
    } else if (isDevtoolsOpen && wasDevtoolsOpen) {
      // DevTools vẫn mở - ghi log định kỳ
      logger.debug('DevTools still open', {
        widthDiff,
        heightDiff,
        duration: Date.now() - lastDetectionTime,
      });
    }
  } catch (error) {
    logger.error('Error checking DevTools', error.message);
  }
}

/**
 * Khởi tạo DevTools detector
 */
export function initDevtoolsDetector() {
  if (isInitialized) {
    logger.debug('DevTools detector already initialized');
    return;
  }

  try {
    loadStats();
    // Kiểm tra lần đầu
    checkDevTools();

    // Thiết lập interval kiểm tra
    intervalId = setInterval(checkDevTools, CHECK_INTERVAL);

    isInitialized = true;
    logger.info('DevTools detector initialized', { checkInterval: CHECK_INTERVAL });
  } catch (error) {
    logger.error('Failed to init DevTools detector', error.message);
    throw error;
  }
}

/**
 * Cleanup DevTools detector
 */
export function cleanupDevtoolsDetector() {
  if (!isInitialized) return;

  try {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    isInitialized = false;
    logger.info('DevTools detector cleanup complete', {
      openCount: devtoolsOpenCount,
      detections: devtoolsLog.length,
    });
  } catch (error) {
    logger.error('Failed to cleanup DevTools detector', error.message);
  }
}

/**
 * Lấy thống kê DevTools
 */
export function getDevtoolsStats() {
  return {
    openCount: devtoolsOpenCount,
    detections: devtoolsLog,
    isCurrentlyOpen: wasDevtoolsOpen,
    totalOpenTime: devtoolsLog.reduce((sum, d) => sum + d.duration, 0),
  };
}

/**
 * Reset stats
 */
export function resetDevtoolsStats() {
  wasDevtoolsOpen = false;
  devtoolsOpenCount = 0;
  devtoolsLog = [];
  lastDetectionTime = null;
  sessionStorage.removeItem(STORAGE_KEY);
}
