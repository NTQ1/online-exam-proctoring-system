/**
 * FR-13: Giám sát Fullscreen
 * - Phát hiện khi sinh viên thoát fullscreen
 * - Hỗ trợ 2 cơ chế:
 *   1. JS Fullscreen API (document.requestFullscreen) → 'fullscreenchange' event
 *   2. Browser fullscreen (F11 / chrome.windows.update) → 'resize' + screen size check
 * - Ghi log và gửi violation lên background mỗi lần thoát
 */

import { logger } from '../core/logger.js';

let isInitialized = false;
let exitCount = 0;
let fullscreenExitDurations = [];
let lastExitTime = null;
let isCurrentlyInFullscreen = false;
let resizeThrottleTimer = null;

// Tolerance: browser chrome (toolbar) chiếm vài pixel
const BROWSER_FULLSCREEN_TOLERANCE = 5;

/**
 * Kiểm tra trạng thái fullscreen thực tế
 * (cả JS Fullscreen API lẫn browser F11 / chrome.windows.update)
 */
function detectFullscreen() {
  if (document.fullscreenElement !== null) return true;
  const wh = window.outerHeight;
  const ww = window.outerWidth;
  const sh = window.screen.height;
  const sw = window.screen.width;
  return (wh >= sh - BROWSER_FULLSCREEN_TOLERANCE) &&
         (ww >= sw - BROWSER_FULLSCREEN_TOLERANCE);
}

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
      data: {
        type,
        severity: type === 'FULLSCREEN_EXIT' ? 'high' : 'info',
        feature: 'fullscreen-monitor',
        timestamp: Date.now(),
        details: data,
      },
    }, () => { chrome.runtime?.lastError; });
  } catch (error) {
    logger.debug('Error sending fullscreen violation', error.message);
  }
}

/**
 * Đánh giá thay đổi trạng thái fullscreen.
 * Được gọi bởi cả fullscreenchange event lẫn resize event.
 */
function evaluateFullscreenState() {
  const now = Date.now();
  const isNowFull = detectFullscreen();

  if (isCurrentlyInFullscreen && !isNowFull) {
    // THOÁT FULLSCREEN — VI PHẠM
    exitCount++;
    lastExitTime = now;
    isCurrentlyInFullscreen = false;

    logger.error('Fullscreen exited - VIOLATION', { exitTime: now, exitCount });
    sendViolation('FULLSCREEN_EXIT', { exitTime: now, exitCount });

  } else if (!isCurrentlyInFullscreen && isNowFull) {
    // QUAY LẠI FULLSCREEN
    const duration = lastExitTime !== null ? now - lastExitTime : 0;

    if (lastExitTime !== null) {
      fullscreenExitDurations.push({ exitTime: lastExitTime, restoreTime: now, duration });
    }

    isCurrentlyInFullscreen = true;
    lastExitTime = null;

    logger.info('Fullscreen restored', { restoreTime: now, duration, exitCount });
    sendViolation('FULLSCREEN_RESTORED', { restoreTime: now, duration, exitCount });
  }
}

function handleFullscreenChange() {
  evaluateFullscreenState();
}

// Throttled resize handler tránh spam khi window đang resize
function handleResize() {
  if (resizeThrottleTimer) return;
  resizeThrottleTimer = setTimeout(() => {
    resizeThrottleTimer = null;
    evaluateFullscreenState();
  }, 150);
}

/**
 * Khởi tạo fullscreen monitor
 */
export function initFullscreenMonitor() {
  if (isInitialized) {
    logger.debug('Fullscreen monitor already initialized');
    return;
  }

  try {
    isCurrentlyInFullscreen = detectFullscreen();

    // Lắng nghe JS Fullscreen API
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Lắng nghe browser fullscreen (F11 / chrome.windows.update)
    window.addEventListener('resize', handleResize);

    isInitialized = true;
    logger.info('Fullscreen monitor initialized (dual-mode)', {
      isCurrentlyInFullscreen,
      jsApi: !!document.fullscreenElement,
      browserLevel: detectFullscreen(),
    });
  } catch (error) {
    logger.error('Failed to init fullscreen monitor', error.message);
    throw error;
  }
}

/**
 * Cleanup fullscreen monitor
 */
export function cleanupFullscreenMonitor() {
  if (!isInitialized) return;

  try {
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('resize', handleResize);

    if (resizeThrottleTimer) {
      clearTimeout(resizeThrottleTimer);
      resizeThrottleTimer = null;
    }

    isInitialized = false;
    logger.info('Fullscreen monitor cleanup complete', {
      exitCount,
      durations: fullscreenExitDurations.length,
    });
  } catch (error) {
    logger.error('Failed to cleanup fullscreen monitor', error.message);
  }
}

/**
 * Lấy thống kê fullscreen
 */
export function getFullscreenStats() {
  return {
    exitCount,
    durations: fullscreenExitDurations,
    isCurrentlyInFullscreen,
    detectionMode: document.fullscreenElement
      ? 'js-api'
      : isCurrentlyInFullscreen ? 'browser-level' : 'not-fullscreen',
    totalExitTime: fullscreenExitDurations.reduce((sum, d) => sum + d.duration, 0),
  };
}

/**
 * Reset stats
 */
export function resetFullscreenStats() {
  exitCount = 0;
  fullscreenExitDurations = [];
  lastExitTime = null;
  isCurrentlyInFullscreen = false;
}
