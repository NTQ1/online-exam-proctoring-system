/**
 * FR-12: Phát hiện chuyển tab / thu nhỏ cửa sổ
 * - Lắng nghe visibilitychange, blur, focus
 * - Ghi log lần vắng mặt và tổng thời gian
 * - Lưu stats vào sessionStorage
 */

import { logger } from '../core/logger.js';

let isInitialized = false;
let isAwayStartTime = null;
let pendingAwayTimer = null; // debounce timer — chống double-count
let totalAwayTime = 0; // milliseconds
let awayCount = 0;
let wasVisible = true;

const STORAGE_KEY = 'proctoring_away_stats';
const AWAY_DEBOUNCE_MS = 50; // thời gian chờ để gộp blur + visibilitychange cùng tick

/**
 * Tải stats từ sessionStorage
 */
function loadStats() {
  try {
    const currentSessionId = window.__proctoringSession?.sessionId;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    
    if (stored) {
      const data = JSON.parse(stored);
      
      // Chỉ khôi phục nếu sessionId khớp (cùng một phiên giám sát)
      if (currentSessionId && data.sessionId === currentSessionId) {
        totalAwayTime = data.totalAwayTime || 0;
        awayCount = data.awayCount || 0;
        logger.debug('Loaded away stats for current session', { totalAwayTime, awayCount });
      } else {
        // SessionId khác hoặc không có -> reset (phiên mới)
        logger.info('Session ID mismatch or missing, starting fresh stats');
        totalAwayTime = 0;
        awayCount = 0;
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    logger.warn('Failed to load away stats', error.message);
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
      totalAwayTime, 
      awayCount 
    }));
  } catch (error) {
    logger.warn('Failed to save away stats', error.message);
  }
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
      data: { type, severity: 'warning', feature: 'tab-switch', timestamp: Date.now(), details: data },
    }, () => { if (chrome.runtime?.lastError) logger.debug('Failed to send violation', chrome.runtime.lastError.message); });
  } catch (error) {
    logger.debug('Error sending violation', error.message);
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Bắt đầu đếm away với debounce 50ms.
 * Nếu cả blur và visibilitychange cùng nổ trong 1 tick
 * (thường xảy ra khi chuyển tab), chỉ 1 away period được tạo ra.
 */
function startAway(reason) {
  if (!wasVisible || isAwayStartTime !== null) return; // đã away rồi

  if (pendingAwayTimer !== null) return; // đã có timer chạy

  pendingAwayTimer = setTimeout(() => {
    pendingAwayTimer = null;
    if (!wasVisible || isAwayStartTime !== null) return; // đã được xử lý bởi event khác

    isAwayStartTime = Date.now();
    awayCount++;
    wasVisible = false;
    logger.warn(`Student away [${reason}]`, { awayStartTime: isAwayStartTime, awayCount, totalAwayTime });
    sendViolation('TAB_AWAY', { reason, awayStartTime: isAwayStartTime, awayCount, totalAwayTime });
  }, AWAY_DEBOUNCE_MS);
}

/**
 * Kết thúc away period.
 */
function endAway(reason) {
  // Hủy timer nếu chưa commit away (trường hợp vào rồi ra rất nhanh < 50ms)
  if (pendingAwayTimer !== null) {
    clearTimeout(pendingAwayTimer);
    pendingAwayTimer = null;
    wasVisible = true;
    return;
  }

  if (wasVisible || isAwayStartTime === null) return; // không có away nào đang chạy

  const awayDuration = Date.now() - isAwayStartTime;
  totalAwayTime += awayDuration;
  wasVisible = true;
  isAwayStartTime = null;
  logger.info(`Student returned [${reason}]`, { awayDuration, totalAwayTime, awayCount });
  sendViolation('TAB_RETURN', { reason, awayDuration, totalAwayTime, awayCount });
  saveStats();
}

// ------------------------------------------------------------------
// Event handlers
// ------------------------------------------------------------------

function handleVisibilityChange() {
  if (document.hidden) {
    startAway('visibilitychange');
  } else {
    endAway('visibilitychange');
  }
}

function handleWindowBlur() {
  startAway('blur');
}

function handleWindowFocus() {
  endAway('focus');
}

/**
 * Khởi tạo tab switch detector
 */
export function initTabSwitchDetector() {
  if (isInitialized) {
    logger.debug('Tab switch detector already initialized');
    return;
  }

  try {
    loadStats();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    isInitialized = true;
    logger.info('Tab switch detector initialized', { totalAwayTime, awayCount });
  } catch (error) {
    logger.error('Failed to init tab switch detector', error.message);
    throw error;
  }
}

/**
 * Cleanup tab switch detector
 */
export function cleanupTabSwitchDetector() {
  if (!isInitialized) return;

  try {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('focus', handleWindowFocus);

    // Hủy debounce timer nếu đang chạy
    if (pendingAwayTimer !== null) {
      clearTimeout(pendingAwayTimer);
      pendingAwayTimer = null;
    }

    // Nếu đang away, tính khoảng thời gian
    if (isAwayStartTime) {
      const duration = Date.now() - isAwayStartTime;
      totalAwayTime += duration;
    }

    saveStats();
    isInitialized = false;
    logger.info('Tab switch detector cleanup complete', { totalAwayTime, awayCount });
  } catch (error) {
    logger.error('Failed to cleanup tab switch detector', error.message);
  }
}

/**
 * Lấy thống kê away
 */
export function getAwayStats() {
  return {
    totalAwayTime,
    awayCount,
    isCurrentlyAway: !wasVisible,
  };
}

/**
 * Reset stats
 */
export function resetAwayStats() {
  if (pendingAwayTimer !== null) {
    clearTimeout(pendingAwayTimer);
    pendingAwayTimer = null;
  }
  totalAwayTime = 0;
  awayCount = 0;
  isAwayStartTime = null;
  wasVisible = true;
  saveStats();
}
