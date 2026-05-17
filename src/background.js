import { logger } from './core/logger.js';
import { clearAuthSession, getAuthState, saveAuthSession, saveProctorSession } from './core/session.js';
import { onMessage, sendToTab } from './core/messaging.js';
import { apiService } from './services/api.js';
import { handleHeartbeat, initHeartbeatSession, startHeartbeatMonitoring, stopHeartbeatMonitoring, clearAllHeartbeatData } from './features/heartbeat-monitor.js';
import { addToOfflineQueue, flushOfflineQueue } from './features/offline-queue.js';

/**
 * BACKGROUND ↔ CONTENT MESSAGE PROTOCOL (Standardized)
 * 
 * All messages use envelope format: { id, type, source, ts, data }
 * All responses follow contract: { ok: boolean, error?: string, ...payload }
 * 
 * HANDLERS (sync response contract):
 * - START_PROCTORING: { ok: true/false, status, error? }
 * - END_PROCTORING: { ok: true/false, status, error? }
 * - GET_SESSION_INFO: { ok: true/false, status, session?, error? }
 * 
 * MESSAGES TO CONTENT (fire-and-forget):
 * - SESSION_UPDATED: background → content (state push)
 */

const runtimeState = {
  status: 'idle',
  session: null,
  activeTabId: null,
  activeWindowId: null,
};

const OVERLAY_ROOT_ID = 'proctor-overlay-root';
const OVERLAY_STYLE_ID = 'proctor-overlay-style';

async function restoreSessionContext() {
  try {
    const session = await getAuthState();

    if (session?.authToken && session?.sessionId) {
      apiService.setContext({
        serverUrl: session.serverUrl,
        token: session.authToken,
        sessionId: session.sessionId,
      });
      logger.info('Session context restored');
    }

    if (session?.proctorSession) {
      const storedSession = session.proctorSession;
      const storedTabId = storedSession.activeTabId;
      const isStale = await isStoredSessionStale(storedSession).catch((error) => {
        logger.warn('Failed to evaluate stored session staleness', error.message);
        return true;
      });

      if (isStale) {
        logger.warn('Stored proctor session is stale, clearing it');
        await clearAuthSession().catch((error) => {
          logger.warn('Failed to clear stale session', error.message);
        });
        runtimeState.status = 'idle';
        runtimeState.session = null;
        runtimeState.activeTabId = null;
        runtimeState.activeWindowId = null;
        return;
      }

      runtimeState.session = session.proctorSession;
      runtimeState.status = session.proctorSession.status || 'active';
      runtimeState.activeTabId = session.proctorSession.activeTabId || null;
      runtimeState.activeWindowId = session.proctorSession.activeWindowId || null;
    }
  } catch (error) {
    logger.warn('Failed to restore session context', error.message);
  }
}


async function handleStartProctoring(data) {
  logger.info('handleStartProctoring called with data:', data);
  const { roomCode, studentName, studentId } = data || {};

  if (!roomCode || !studentName || !studentId) {
    logger.error('Missing required fields for START_PROCTORING', { roomCode, studentName, studentId });
    return {
      ok: false,
      status: 'error',
      error: 'Thiếu thông tin phòng thi hoặc sinh viên',
    };
  }

  if (runtimeState.status === 'authenticating') {
    return {
      ok: false,
      status: 'error',
      error: 'Phiên giám sát đang được khởi tạo',
    };
  }

  if (runtimeState.status === 'active') {
    logger.warn('Existing active session will be superseded by new START_PROCTORING request');
    void forceResetSession('superseded_by_new_session').catch((error) => {
      logger.warn('forceResetSession failed', error.message);
    });
  }

  runtimeState.status = 'authenticating';

  try {
    const authResponse = await authenticateRoomCode(roomCode, studentName, studentId);
    await processStartProctoring({ roomCode, studentName, studentId, authResponse });

    logger.info('handleStartProctoring completed successfully');
    return { ok: true, status: 'starting' };
  } catch (error) {
    logger.error('handleStartProctoring failed', error);
    runtimeState.status = 'idle';
    runtimeState.session = null;
    runtimeState.activeTabId = null;
    runtimeState.activeWindowId = null;
    await clearAuthSession().catch(() => {});

    return {
      ok: false,
      status: 'error',
      error: error.message || 'Không thể bắt đầu giám sát',
    };
  }
}

async function processStartProctoring({ roomCode, studentName, studentId, authResponse }) {
  try {
    apiService.setContext({
      serverUrl: authResponse.serverUrl,
      token: authResponse.token,
      sessionId: authResponse.sessionId,
    });

    const tab = await getCurrentExamTab();
    const tabs = await collectOpenTabs();
    const startedAt = Date.now();

    const session = {
      roomCode,
      studentName,
      studentId,
      authToken: authResponse.token,
      sessionId: authResponse.sessionId,
      serverUrl: authResponse.serverUrl,
      startedAt,
      status: 'active',
      activeTabId: tab.id,
      activeWindowId: tab.windowId,
      tabs,
      client: getClientMetadata(),
    };

    logger.info('processStartProctoring: Starting API session');
    await apiService.startSession({
      roomCode,
      studentName,
      studentId,
      tabs,
      timestamp: startedAt,
      client: session.client,
    });

    runtimeState.status = 'active';
    runtimeState.session = session;
    runtimeState.activeTabId = tab.id;
    runtimeState.activeWindowId = tab.windowId;

    await saveAuthSession({
      roomCode,
      studentName,
      studentId,
      authToken: authResponse.token,
      sessionId: authResponse.sessionId,
      serverUrl: authResponse.serverUrl,
    });
    await saveProctorSession(session);

    logger.info('processStartProctoring: Injecting overlay into tab', tab.id);
    await injectOverlay(tab.id);
    logger.info('processStartProctoring: Overlay injected successfully');

    logger.info('processStartProctoring: Starting heartbeat monitoring');
    initHeartbeatSession(session.sessionId, tab.id); // seed lastHeartbeat ngay khi tạo session
    startHeartbeatMonitoring();
    logger.info('processStartProctoring: Heartbeat monitoring started');

    logger.info('processStartProctoring: Requesting fullscreen for tab', tab.id);
    await requestTabFullscreen(tab.id).catch((error) => {
      logger.warn('Failed to request fullscreen', error.message);
    });

    return session;
  } catch (error) {
    logger.error('Start proctoring failed', error);

    if (runtimeState.session?.sessionId) {
      await apiService.endSession({
        endedAt: Date.now(),
        status: 'ended',
        reason: 'start_flow_failed',
        summary: {
          roomCode: runtimeState.session.roomCode,
          studentName: runtimeState.session.studentName,
          studentId: runtimeState.session.studentId,
          failureStage: 'start_or_inject',
        },
      }).catch((cleanupError) => {
        logger.warn('Rollback endSession failed', cleanupError.message);
      });
    }

    runtimeState.status = 'error';
    runtimeState.session = null;
    runtimeState.activeTabId = null;
    runtimeState.activeWindowId = null;
    await clearAuthSession().catch(() => {});
    throw error;
  }
}

async function handleEndProctoring(data, sender) {
  // Try runtimeState first
  let session = runtimeState.session;

  // Bug 2 fix: Service worker may have been killed and restarted (state lost).
  // Attempt to restore session from chrome.storage before giving up.
  // NOTE: session.js stores data under individual keys, not a single 'auth_session' key.
  // Use getAuthState() which reads 'proctorSession' (and other keys) correctly.
  if (!session?.sessionId) {
    try {
      const stored = await getAuthState();
      const storedSession = stored?.proctorSession;
      if (storedSession?.sessionId) {
        logger.info('handleEndProctoring: Restoring session from storage after SW restart');
        runtimeState.session = storedSession;
        runtimeState.status = 'active';
        runtimeState.activeTabId = storedSession.activeTabId || sender?.tab?.id || null;
        runtimeState.activeWindowId = storedSession.activeWindowId || null;
        session = storedSession;

        // Also restore API context so endSession() can reach the backend
        if (storedSession.authToken && storedSession.sessionId) {
          apiService.setContext({
            serverUrl: storedSession.serverUrl,
            token: storedSession.authToken,
            sessionId: storedSession.sessionId,
          });
        }
      }
    } catch (storageError) {
      logger.warn('handleEndProctoring: Failed to restore session from storage', storageError.message);
    }
  }

  if (!session?.sessionId) {
    logger.warn('handleEndProctoring called without active session');
    return {
      ok: false,
      status: 'error',
      error: 'Không có phiên giám sát đang hoạt động',
    };
  }

  logger.info('handleEndProctoring called', {
    hasRuntimeSession: !!runtimeState.session,
    runtimeStatus: runtimeState.status,
    activeTabId: runtimeState.activeTabId,
    restoredFromStorage: session !== runtimeState.session, // true nếu session được lấy từ storage
  });
  runtimeState.status = 'ending';

  try {
    await processEndProctoring({
      data,
      sender,
      session,
    });

    return { ok: true, status: 'ending' };
  } catch (error) {
    runtimeState.status = 'active';
    logger.error('processEndProctoring failed', error);
    return {
      ok: false,
      status: 'error',
      error: error.message || 'Không thể kết thúc phiên vì chưa lưu được dữ liệu lên backend',
    };
  }
}

async function processEndProctoring({ data, sender, session }) {
  const endedAt = Date.now();
  const windowId = session.activeWindowId || sender?.tab?.windowId || runtimeState.activeWindowId;

  logger.info('processEndProctoring: Starting cleanup');

  const screenshotDataUrl = await captureFinalScreenshot(windowId).catch((error) => {
    logger.warn('captureFinalScreenshot failed', error.message);
    return null;
  });

  const endPayload = {
    endedAt,
    status: 'ended',
    reason: data?.reason || 'user_clicked_end',
    screenshotDataUrl,
    summary: {
      roomCode: session.roomCode,
      studentName: session.studentName,
      studentId: session.studentId,
      totalTabs: session.tabs?.length || 0,
    },
  };

  logger.info('processEndProctoring: Syncing with backend');
  await apiService.endSession(endPayload);
  logger.info('processEndProctoring: Backend sync complete');

  if (typeof runtimeState.activeTabId === 'number') {
    await removeOverlayDirectly(runtimeState.activeTabId).catch((error) => {
      logger.warn('Failed to remove overlay directly', error.message);
    });
  }

  await exitTabFullscreen(windowId);

  await cleanupRuntime();

  logger.info('END_PROCTORING completed successfully');
}

async function isActiveSessionReusable() {
  const session = runtimeState.session;
  if (!session?.sessionId || typeof session.activeTabId !== 'number') {
    return false;
  }

  try {
    await chrome.tabs.get(session.activeTabId);
    return true;
  } catch (error) {
    logger.warn('Active session tab is no longer available', error.message);
    return false;
  }
}

async function isStoredSessionStale(session) {
  if (!session?.sessionId) return true;

  if (typeof session.startedAt === 'number') {
    const maxAgeMs = 1000 * 60 * 60 * 4;
    if (Date.now() - session.startedAt > maxAgeMs) {
      return true;
    }
  }

  if (typeof session.activeTabId !== 'number') {
    return true;
  }

  try {
    await chrome.tabs.get(session.activeTabId);
    return false;
  } catch (error) {
    return true;
  }
}

async function forceResetSession(reason = 'force_reset') {
  const session = runtimeState.session;

  logger.warn('forceResetSession called', {
    reason,
    sessionId: session?.sessionId,
    status: runtimeState.status,
    activeTabId: runtimeState.activeTabId,
  });

  if (session?.sessionId) {
    await apiService.endSession({
      endedAt: Date.now(),
      status: 'ended',
      reason,
      summary: {
        roomCode: session.roomCode,
        studentName: session.studentName,
        studentId: session.studentId,
        totalTabs: session.tabs?.length || 0,
      },
    }).catch((error) => {
      logger.warn('forceResetSession endSession failed', error.message);
    });
  }

  if (typeof runtimeState.activeTabId === 'number') {
    await removeOverlayDirectly(runtimeState.activeTabId).catch((error) => {
      logger.warn('forceResetSession direct overlay cleanup failed', error.message);
    });
  }

  await exitTabFullscreen(session?.activeWindowId || runtimeState.activeWindowId);

  await cleanupRuntime();
}

async function removeOverlayDirectly(tabId) {
  if (typeof tabId !== 'number') return;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (rootId) => {
      const root = document.getElementById(rootId);
      if (root) root.remove();
    },
    args: [OVERLAY_ROOT_ID],
  });

  // Remove injected CSS
  await chrome.scripting.removeCSS({
    target: { tabId },
    files: ['src/overlay.css'],
  }).catch(() => {});

  // Cleanup camera monitor in ISOLATED world (default)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { window.__cameraMonitor?.stop?.(); } catch(e) {} },
  }).catch(() => {});

  // Cleanup features in MAIN world
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      try {
        if (window.__features) {
          window.__features.blockActions?.cleanup?.();
          window.__features.tabSwitch?.cleanup?.();
          window.__features.fullscreen?.cleanup?.();
          window.__features.devtools?.cleanup?.();
          window.__features.heartbeat?.cleanup?.();
          delete window.__features;
        }
        delete window.__proctoringSession;
        delete window.__extSendMessage;
        delete window.logger;
      } catch (e) {}
    },
  }).catch(() => {});
}

function handleGetSessionInfo() {
  if (!runtimeState.session) {
    logger.debug('handleGetSessionInfo called with no active session');
    return {
      ok: false,
      status: 'idle',
      error: 'No active session',
    };
  }

  logger.debug('handleGetSessionInfo returning session for', runtimeState.session.studentId);
  return {
    ok: true,
    status: runtimeState.status,
    session: runtimeState.session,
  };
}

/**
 * FR-15: Handle HEARTBEAT from content script
 */
function handleHeartbeatMessage(data) {
  try {
    if (!data?.sessionId) {
      logger.warn('Heartbeat received without sessionId');
      return { ok: false, error: 'No sessionId' };
    }

    handleHeartbeat(data);
    logger.debug('Heartbeat processed for session', data.sessionId);
    return { ok: true };
  } catch (error) {
    logger.error('Failed to handle heartbeat', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Handle REMOVE_OVERLAY_CSS from content script (sent when overlay self-removes)
 */
async function handleRemoveOverlayCSS(data, sender) {
  const tabId = sender?.tab?.id ?? runtimeState.activeTabId;
  if (typeof tabId !== 'number') return { ok: false };

  await chrome.scripting.removeCSS({
    target: { tabId },
    files: ['src/overlay.css'],
  }).catch(() => {});

  // Cleanup camera monitor in ISOLATED world (default)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { window.__cameraMonitor?.stop?.(); } catch(e) {} },
  }).catch(() => {});

  // Cleanup features in MAIN world
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      try {
        if (window.__features) {
          window.__features.blockActions?.cleanup?.();
          window.__features.tabSwitch?.cleanup?.();
          window.__features.fullscreen?.cleanup?.();
          window.__features.devtools?.cleanup?.();
          window.__features.heartbeat?.cleanup?.();
          delete window.__features;
        }
        delete window.__proctoringSession;
        delete window.__extSendMessage;
        delete window.logger;
      } catch (e) {}
    },
  }).catch(() => {});

  return { ok: true };
}

/**
 * FR-11 đến FR-14: Handle LOG_VIOLATION from content script
 */
async function handleLogViolation(data) {
  try {
    if (!data?.type || !runtimeState.session) {
      logger.warn('LOG_VIOLATION received with invalid data', { hasType: !!data?.type, hasSession: !!runtimeState.session });
      return { ok: false, error: 'Invalid violation data' };
    }

    const violationData = {
      sessionId: runtimeState.session.sessionId,
      type: data.type,
      severity: data.severity || 'warning',
      feature: data.feature,
      timestamp: data.timestamp || Date.now(),
      details: data.details || {},
    };

    logger.warn('Violation logged', { type: data.type, feature: data.feature });

    // Gửi ngay lên backend
    try {
      await apiService.logViolation(violationData);
      return { ok: true };
    } catch (error) {
      logger.error('Failed to send violation to backend', error.message);

      // Thêm vào offline queue nếu backend offline
      await addToOfflineQueue(runtimeState.session.sessionId, {
        type: 'VIOLATION',
        ...violationData,
      }).catch((queueError) => {
        logger.error('Failed to add violation to offline queue', queueError.message);
      });

      return { ok: false, error: error.message };
    }
  } catch (error) {
    logger.error('Error in handleLogViolation', error.message);
    return { ok: false, error: error.message };
  }
}

async function authenticateRoomCode(roomCode, studentName, studentId) {
  try {
    const data = await apiService.authenticateRoomCode(roomCode, studentName, studentId);

    if (!data || !data.token || !data.sessionId) {
      throw new Error('Backend trả về không hợp lệ');
    }

    return {
      token: data.token,
      sessionId: data.sessionId,
      serverUrl: data.serverUrl || apiService.getServerUrl(),
    };
  } catch (error) {
    if (String(error.message || '').includes('Failed to fetch') || String(error.message || '').includes('NetworkError')) {
      throw new Error('Backend chưa chạy, vui lòng khởi động backend trước khi bắt đầu giám sát');
    }

    throw error;
  }
}

async function getCurrentExamTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs.length || typeof tabs[0].id !== 'number') {
    throw new Error('Không tìm thấy tab thi hiện tại');
  }

  const tab = tabs[0];
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    throw new Error('Không thể giám sát trên trang hệ thống của trình duyệt');
  }

  return tab;
}

async function collectOpenTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => !tab.discarded)
    .map((tab) => ({
      id: tab.id,
      title: tab.title || 'Tab không tên',
      url: sanitizeUrl(tab.url),
      active: Boolean(tab.active),
      windowId: tab.windowId,
    }));
}

function sanitizeUrl(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

function getClientMetadata() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  };
}

async function injectOverlay(tabId) {
  const extensionBaseUrl = chrome.runtime.getURL('');
  const session = runtimeState.session;

  // Đảm bảo Offscreen Document và model sẵn sàng TRƯỚC khi inject camera-monitor
  try {
    await ensureOffscreenDocument();
    logger.info('[AI-BG] Offscreen document ready for tab', tabId);
  } catch (err) {
    logger.warn('[AI-BG] Could not ensure offscreen document:', err.message);
  }

  // Inject CSS bypassing CSP
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['src/overlay.css']
  });

  // Inject feature modules into the MAIN world safely (no inline scripts)
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [extensionBaseUrl, session.sessionId, session.activeTabId, chrome.runtime.id],
    func: async (baseUrl, sessionId, activeTabId, extId) => {
      try {
        if (sessionId) {
          window.__proctoringSession = { sessionId, tabId: activeTabId };
        }

          window.__extSendMessage = function(message, callback) {
          try {
            chrome.runtime.sendMessage(
              extId,    // explicit extensionId — required when called from non-extension context
              message,
              callback || function() { chrome.runtime.lastError; }
            );
          } catch (err) {
            // Silently ignore if runtime is unavailable
          }
        };

        const moduleURLs = {
          logger: baseUrl + 'src/core/logger.js',
          blockActions: baseUrl + 'src/features/block-actions.js',
          tabSwitch: baseUrl + 'src/features/tab-switch-detector.js',
          fullscreen: baseUrl + 'src/features/fullscreen-monitor.js',
          devtools: baseUrl + 'src/features/devtools-detector.js',
          heartbeat: baseUrl + 'src/features/heartbeat.js',
        };

        const loggerModule = await import(moduleURLs.logger);
        window.logger = loggerModule.logger;

        const [
          blockActionsModule,
          tabSwitchModule,
          fullscreenModule,
          devtoolsModule,
          heartbeatModule
        ] = await Promise.all([
          import(moduleURLs.blockActions),
          import(moduleURLs.tabSwitch),
          import(moduleURLs.fullscreen),
          import(moduleURLs.devtools),
          import(moduleURLs.heartbeat)
        ]);

        window.__features = {
          blockActions: {
            init: blockActionsModule.initBlockActions,
            cleanup: blockActionsModule.cleanupBlockActions,
            getCount: blockActionsModule.getBlockActionsCount,
            reset: blockActionsModule.resetBlockActionsCount,
          },
          tabSwitch: {
            init: tabSwitchModule.initTabSwitchDetector,
            cleanup: tabSwitchModule.cleanupTabSwitchDetector,
            getStats: tabSwitchModule.getAwayStats,
          },
          fullscreen: {
            init: fullscreenModule.initFullscreenMonitor,
            cleanup: fullscreenModule.cleanupFullscreenMonitor,
            getStats: fullscreenModule.getFullscreenStats,
          },
          devtools: {
            init: devtoolsModule.initDevtoolsDetector,
            cleanup: devtoolsModule.cleanupDevtoolsDetector,
            getStats: devtoolsModule.getDevtoolsStats,
          },
          heartbeat: {
            init: heartbeatModule.initHeartbeat,
            cleanup: heartbeatModule.cleanupHeartbeat,
          },
        };

        window.__features.blockActions.init();
        window.__features.tabSwitch.init();
        window.__features.fullscreen.init();
        window.__features.devtools.init();
        window.__features.heartbeat.init();
        
      } catch (error) {
        console.error('[Proctor] Failed to load modules via executeScript:', error);
      }
    }
  });

  // Inject content.js safely into ISOLATED world (no interaction with MAIN needed now)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content.js']
  });

  // Inject camera-monitor vào ISOLATED world (default) — chrome.runtime.sendMessage hoạt động trực tiếp
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/features/camera-monitor.js'],
  }).catch(err => {
    logger.warn('[AI-BG] camera-monitor injection failed (non-fatal):', err.message);
  });

  logger.info('Overlay, feature modules, and camera monitor injected into tab', tabId);
}

async function requestTabFullscreen(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { state: 'fullscreen' });
    logger.info('Window fullscreen activated for tab', tabId);
  } catch (error) {
    logger.warn('Failed to set window fullscreen', error.message);
  }
}

async function exitTabFullscreen(windowId) {
  try {
    if (typeof windowId === 'number') {
      await chrome.windows.update(windowId, { state: 'maximized' });
      logger.info('Window fullscreen deactivated for window', windowId);
    }
  } catch (error) {
    logger.warn('Failed to exit window fullscreen', error.message);
  }
}

async function captureFinalScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId || undefined,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(dataUrl || null);
      }
    );
  });
}

async function cleanupRuntime() {
  logger.warn('cleanupRuntime called', {
    status: runtimeState.status,
    sessionId: runtimeState.session?.sessionId,
    activeTabId: runtimeState.activeTabId,
    activeWindowId: runtimeState.activeWindowId,
    stack: new Error().stack.split('\n').slice(1, 4).join(' | '), // call stack (3 frames)
  });

  runtimeState.status = 'ended';

  logger.info('cleanupRuntime: Stopping heartbeat monitoring');
  stopHeartbeatMonitoring();
  clearAllHeartbeatData();

  // Remove injected CSS from the proctored tab
  if (typeof runtimeState.activeTabId === 'number') {
    await chrome.scripting.removeCSS({
      target: { tabId: runtimeState.activeTabId },
      files: ['src/overlay.css'],
    }).catch((err) => {
      logger.warn('cleanupRuntime: removeCSS failed', err.message);
    });
  }

  // Notify content script of cleanup so it can dispose its state
  if (typeof runtimeState.activeTabId === 'number') {
    const tabId = runtimeState.activeTabId; // lưu lại trước khi clear
    try {
      await sendToTab(tabId, 'SESSION_CLEANUP', { reason: 'backend_ended_or_timeout' });
      logger.debug('Sent SESSION_CLEANUP signal to content script');
    } catch (error) {
      logger.warn('Failed to send cleanup signal to content, trying executeScript fallback:', error.message);
      // Fallback: gọi trực tiếp qua executeScript nếu sendToTab thất bại
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { try { window.__cameraMonitor?.stop?.(); } catch (_) {} },
      }).catch(() => {});
    }
  }

  runtimeState.session = null;
  runtimeState.activeTabId = null;
  runtimeState.activeWindowId = null;
  await clearAuthSession().catch((error) => {
    logger.warn('cleanupRuntime clearAuthSession failed', error.message);
  });

  // Đợi camera-monitor kịp nhận 'Session ended' và dừng interval
  // trước khi đóng offscreen document (tránh 'Receiving end does not exist')
  await new Promise(resolve => setTimeout(resolve, 1200));

  // Đóng Offscreen Document sau khi session kết thúc
  await closeOffscreenDocument().catch(err => {
    logger.debug('cleanupRuntime closeOffscreen (non-fatal):', err.message);
  });

  logger.info('cleanupRuntime complete');
}

// ─── AI / Offscreen Document Management ────────────────────────────────────

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
let offscreenCreating = false;

/**
 * Đảm bảo Offscreen Document đang tồn tại.
 * MV3 chỉ cho phép 1 offscreen document tại một thời điểm.
 */
async function ensureOffscreenDocument() {
  // Chrome 116+ có existingContexts API
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    if (existing.length > 0) {
      logger.debug('Offscreen document already exists');
      return;
    }
  }

  if (offscreenCreating) {
    // Đợi lần tạo đang diễn ra
    await new Promise(resolve => setTimeout(resolve, 300));
    return;
  }

  offscreenCreating = true;
  try {
    await chrome.offscreen.createDocument({
      url:     OFFSCREEN_URL,
      reasons: [
        // DOM_SCRAPING: cần canvas/DOM để TF.js vẽ tensor và xử lý ảnh
        chrome.offscreen.Reason.DOM_SCRAPING,
      ],
      justification: 'Run YOLO TF.js inference for AI cheating detection (canvas + WebGL)',
    });
    logger.info('[AI-BG] Offscreen document created');
  } catch (err) {
    // "Only a single offscreen document" — document already exists
    if (!err.message?.includes('single offscreen')) {
      logger.error('[AI-BG] Failed to create offscreen document:', err.message);
      throw err;
    }
    logger.debug('[AI-BG] Offscreen document already exists (caught on create)');
  } finally {
    offscreenCreating = false;
  }
}

/**
 * Xóa Offscreen Document khi kết thúc giám sát.
 */
async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
    logger.info('[AI-BG] Offscreen document closed');
  } catch (err) {
    // Không có offscreen đang tồn tại — bỏ qua
    logger.debug('[AI-BG] closeOffscreenDocument (already closed):', err.message);
  }
}

/**
 * Handler: AI_ENSURE_OFFSCREEN — từ camera-monitor.js content script
 */
async function handleEnsureOffscreen() {
  try {
    await ensureOffscreenDocument();
    // Yêu cầu offscreen pre-load model
    chrome.runtime.sendMessage({ type: 'AI_INIT_MODEL' }, (res) => {
      if (chrome.runtime.lastError) {
        logger.warn('[AI-BG] AI_INIT_MODEL error:', chrome.runtime.lastError.message);
      } else {
        logger.info('[AI-BG] Model init response:', res?.status);
      }
    });
    return { ok: true };
  } catch (err) {
    logger.error('[AI-BG] handleEnsureOffscreen failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Handler: AI_FRAME — frame từ camera-monitor.js
 * Chuyển tiếp đến Offscreen Document để inference.
 */
async function handleAIFrame(data) {
  // Guard: session đã kết thúc → không cố forward đến offscreen đã bị đóng
  if (runtimeState.status !== 'active') {
    return { ok: false, error: 'Session ended', detections: [] };
  }

  try {
    await ensureOffscreenDocument();

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type:      'AI_INFERENCE',
          imageData: data.imageData,
          width:     data.width,
          height:    data.height,
          frameId:   data.frameId,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            logger.warn('[AI-BG] AI_INFERENCE relay error:', chrome.runtime.lastError.message);
            resolve({ ok: false, error: chrome.runtime.lastError.message, detections: [] });
          } else {
            resolve(result || { ok: false, detections: [] });
          }
        }
      );
    });
  } catch (err) {
    logger.error('[AI-BG] handleAIFrame error:', err.message);
    return { ok: false, error: err.message, detections: [] };
  }
}

/**
 * Handler: AI_VIOLATION — khi camera-monitor phát hiện vi phạm nghiêm trọng
 * Gửi lên backend kèm ảnh chụp.
 */
async function handleAIViolation(data) {
  const { detections = [], imageDataUrl, timestamp } = data;

  logger.warn('[AI-BG] 🚨 AI Violation received', {
    classes: detections.map(d => d.className),
    timestamp: new Date(timestamp || Date.now()).toISOString(),
  });

  if (!runtimeState.session?.sessionId) {
    logger.warn('[AI-BG] No active session — AI violation dropped');
    return { ok: false, error: 'No active session' };
  }

  try {
    const result = await apiService.reportAIViolation(detections, imageDataUrl);
    logger.info('[AI-BG] AI violation reported to backend', result);
    return { ok: true, result };
  } catch (err) {
    logger.error('[AI-BG] Failed to report AI violation:', err.message);
    return { ok: false, error: err.message };
  }
}

function initializeBackground() {
  restoreSessionContext().then(() => {
    logger.info('Background service worker initialized and session restored');
  }).catch((error) => {
    logger.warn('Background init error:', error.message);
  });

  // Handle extension unload
  if (chrome.runtime && chrome.runtime.onSuspend) {
    chrome.runtime.onSuspend.addListener(() => {
      logger.info('Background service worker suspended');
      // Dọn dẹp offscreen khi service worker unload
      closeOffscreenDocument().catch(() => {});
    });
  }
}

// REGISTER MESSAGE LISTENER IMMEDIATELY
// AI_FRAME, AI_VIOLATION, AI_ENSURE_OFFSCREEN xử lý riêng bên dưới
// vì camera-monitor gửi raw message (không bọc envelope {type, data})
onMessage({
  START_PROCTORING:    handleStartProctoring,
  END_PROCTORING:      handleEndProctoring,
  GET_SESSION_INFO:    handleGetSessionInfo,
  HEARTBEAT:           handleHeartbeatMessage,
  LOG_VIOLATION:       handleLogViolation,
  REMOVE_OVERLAY_CSS:  handleRemoveOverlayCSS,
});

// ── AI message handler (raw listener — camera-monitor gửi flat message) ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'AI_FRAME' && message?.imageData) {
    handleAIFrame(message)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message, detections: [] }));
    return true;
  }
  if (message?.type === 'AI_VIOLATION' && message?.detections) {
    handleAIViolation(message)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message?.type === 'AI_ENSURE_OFFSCREEN') {
    handleEnsureOffscreen()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});

// Initialize service worker
try {
  logger.setLevel('debug');
  initializeBackground();
} catch (error) {
  console.error('Background init failed:', error.message);
}
