/**
 * FR-11: Chặn các hành vi nguy hiểm (copy, paste, cut, chuột phải, kéo thả, in trang, phím tắt)
 * - Chặn các sự kiện: copy, cut, paste, contextmenu, dragstart, drop, keydown
 * - Ghi log và gửi violation lên background
 * - Thực thi ngay từ lúc load, không chờ phiên
 */

import { logger } from '../core/logger.js';

let isInitialized = false;
let blockActionsCount = 0;
let listeners = [];

const STORAGE_KEY = 'proctoring_block_stats';

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
        blockActionsCount = data.count || 0;
        logger.debug('Loaded block counts for current session', { blockActionsCount });
      } else {
        logger.info('Session ID mismatch for block-actions, starting fresh');
        blockActionsCount = 0;
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    logger.warn('Failed to load block stats', error.message);
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
      count: blockActionsCount 
    }));
  } catch (error) {
    logger.warn('Failed to save block stats', error.message);
  }
}

// Danh sách phím tắt nguy hiểm (keyCode + modifier)
// Chỉ các modifier được khai báo (true) mới được kiểm tra bắt buộc.
// Modifier không khai báo (undefined/false) sẽ bị bỏ qua — tránh chặn oan.
const DANGEROUS_KEYS = [
  { ctrlKey: true, code: 'KeyP', name: 'Ctrl+P (In trang)' },
  { ctrlKey: true, code: 'KeyU', name: 'Ctrl+U (View Source)' },
  { ctrlKey: true, code: 'KeyS', name: 'Ctrl+S (Lưu trang)' },
  { code: 'F12', name: 'F12 (DevTools)' },
  { ctrlKey: true, shiftKey: true, code: 'KeyI', name: 'Ctrl+Shift+I (DevTools)' },
  { ctrlKey: true, shiftKey: true, code: 'KeyC', name: 'Ctrl+Shift+C (Inspector)' },
  { ctrlKey: true, shiftKey: true, code: 'KeyJ', name: 'Ctrl+Shift+J (Console)' },
  { ctrlKey: true, shiftKey: true, code: 'KeyK', name: 'Ctrl+Shift+K (DevTools)' },
  { code: 'Escape', name: 'Escape (thoát toàn màn hình)' },
  // Chặn nút chụp màn hình
  { code: 'PrintScreen', name: 'PrintScreen (Chụp màn hình)' },
  { ctrlKey: true, code: 'PrintScreen', name: 'Ctrl+PrintScreen (Chụp màn hình)' },
  { altKey: true, code: 'PrintScreen', name: 'Alt+PrintScreen (Chụp cửa sổ)' },
  { metaKey: true, shiftKey: true, code: 'KeyS', name: 'Win+Shift+S (Snipping Tool)' },
];

/**
 * Ghi log violation và gửi lên background nếu có phiên
 */
function logViolation(actionType, details = {}) {
  blockActionsCount++;
  
  const logData = {
    feature: 'block-actions',
    action: actionType,
    timestamp: Date.now(),
    count: blockActionsCount,
    ...details,
  };

  logger.warn(`Block action: ${actionType}`, logData);
  saveStats();
  sendViolation(actionType, logData);
}

function sendViolation(type, details) {
  if (!window.__proctoringSession) return;
  const sendFn = window.__extSendMessage || function(msg, cb) {
    try { chrome.runtime.sendMessage(msg, cb); } catch(e) {}
  };
  try {
    sendFn({
      type: 'LOG_VIOLATION',
      data: { type, severity: 'warning', feature: 'block-actions', timestamp: Date.now(), details },
    }, () => { chrome.runtime?.lastError; });
  } catch (error) {
    logger.debug('Error sending violation', error.message);
  }
}

/**
 * Handler cho copy
 */
function handleCopy(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('COPY');
}

/**
 * Handler cho cut
 */
function handleCut(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('CUT');
}

/**
 * Handler cho paste
 */
function handlePaste(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('PASTE');
}

/**
 * Handler cho context menu (chuột phải)
 */
function handleContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('CONTEXT_MENU');
}

/**
 * Handler cho drag start
 */
function handleDragStart(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('DRAG_START');
}

/**
 * Handler cho drop
 */
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  logViolation('DROP');
}

/**
 * Handler cho keydown - chặn phím tắt nguy hiểm
 */
function handleKeyDown(e) {
  for (const dangerousKey of DANGEROUS_KEYS) {
    // Chỉ kiểm tra modifier nếu rule khai báo là true.
    // Không khai báo (undefined) → bỏ qua, tránh chặn oan phím tắt hợp lệ.
    const ctrlMatch  = dangerousKey.ctrlKey  ? e.ctrlKey  : true;
    const shiftMatch = dangerousKey.shiftKey ? e.shiftKey : true;
    const altMatch   = dangerousKey.altKey   ? e.altKey   : true;
    const metaMatch  = dangerousKey.metaKey  ? e.metaKey  : true;
    const codeMatch  = e.code === dangerousKey.code;

    if (codeMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
      e.preventDefault();
      e.stopPropagation();
      logViolation('DANGEROUS_SHORTCUT', { shortcut: dangerousKey.name });
      return;
    }
  }
}

/**
 * Khởi tạo block actions
 */
export function initBlockActions() {
  if (isInitialized) {
    logger.debug('Block actions already initialized');
    return;
  }

  try {
    loadStats();
    // Attach listeners
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('drop', handleDrop, true);
    document.addEventListener('keydown', handleKeyDown, true);

    // Lưu lại để cleanup
    listeners = [
      { event: 'copy', handler: handleCopy },
      { event: 'cut', handler: handleCut },
      { event: 'paste', handler: handlePaste },
      { event: 'contextmenu', handler: handleContextMenu },
      { event: 'dragstart', handler: handleDragStart },
      { event: 'drop', handler: handleDrop },
      { event: 'keydown', handler: handleKeyDown },
    ];

    isInitialized = true;
    logger.info('Block actions initialized', { listenerCount: listeners.length });
  } catch (error) {
    logger.error('Failed to init block actions', error.message);
    throw error;
  }
}

/**
 * Cleanup block actions
 */
export function cleanupBlockActions() {
  if (!isInitialized) return;

  try {
    listeners.forEach(({ event, handler }) => {
      document.removeEventListener(event, handler, true);
    });

    listeners = [];
    isInitialized = false;
    logger.info('Block actions cleanup complete');
  } catch (error) {
    logger.error('Failed to cleanup block actions', error.message);
  }
}

/**
 * Lấy số lượng hành vi bị chặn
 */
export function getBlockActionsCount() {
  return blockActionsCount;
}

/**
 * Reset counter (dùng khi cleanup phiên)
 */
export function resetBlockActionsCount() {
  blockActionsCount = 0;
  sessionStorage.removeItem(STORAGE_KEY);
}
