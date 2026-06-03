import { logger } from './core/logger.js';
import { clearAuthSession, getAuthState, saveAuthSession, saveProctorSession } from './core/session.js';
import { onMessage, sendToTab } from './core/messaging.js';
import { apiService } from './services/api.js';
import { handleHeartbeat, handleHeartbeatAlarm, restoreHeartbeatMap, initHeartbeatSession, startHeartbeatMonitoring, stopHeartbeatMonitoring, clearAllHeartbeatData, resetHeartbeatData } from './features/heartbeat-monitor.js';
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
    // FIX: await forceResetSession để đảm bảo cleanup hoàn tất TRƯỚC khi start session mới.
    // Không dùng void vì nếu cleanup chưa xong mà processStartProctoring chạy song song,
    // runtimeState sẽ bị ghi đè, tạo ra session zombie.
    await forceResetSession('superseded_by_new_session').catch((error) => {
      logger.warn('forceResetSession failed', error.message);
    });
  }

  // Guard: nếu một END_PROCTORING đang xử lý, từ chối start mới
  if (runtimeState.status === 'ending') {
    return {
      ok: false,
      status: 'error',
      error: 'Phiên giám sát đang được kết thúc, vui lòng đợi',
    };
  }

  runtimeState.status = 'authenticating';

  try {
    const authResponse = await authenticateRoomCode(roomCode, studentName, studentId);

    // Guard: kiểm tra lại sau khi authenticate xong — có thể đã có END được gửi trong khi chờ
    if (runtimeState.status === 'ending') {
      logger.warn('handleStartProctoring: session ended during authentication, aborting start');
      runtimeState.status = 'idle';
      return { ok: false, status: 'error', error: 'Phiên đang kết thúc, không thể bắt đầu mới' };
    }

    await processStartProctoring({ roomCode, studentName, studentId, authResponse });

    logger.info('handleStartProctoring completed successfully');
    return { ok: true, status: 'starting' };
  } catch (error) {
    logger.error('handleStartProctoring failed', error);
    runtimeState.status = 'idle';
    runtimeState.session = null;
    runtimeState.activeTabId = null;
    runtimeState.activeWindowId = null;
    await clearAuthSession().catch(() => { });

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

    // FIX #1: Fullscreen TRƯỚC khi inject overlay và load model
    // Lý do: UX tốt hơn — sinh viên thấy fullscreen ngay sau xác thực,
    // không phải chờ model AI tải xong mới full màn hình
    logger.info('processStartProctoring: Requesting fullscreen for tab', tab.id);
    await requestTabFullscreen(tab.id).catch((error) => {
      logger.warn('Failed to request fullscreen', error.message);
    });

    // Đảm bảo Offscreen Document và model sẵn sàng TRƯỚC khi inject camera-monitor.
    // ensureOffscreenDocument() khởi động model load không đồng bộ trong nền.
    // camera-monitor.js sẽ tự poll AI_STATUS để chờ model ready trước khi inference.
    logger.info('processStartProctoring: Ensuring offscreen document');
    await ensureOffscreenDocument().catch((err) => {
      logger.warn('[AI-BG] Could not pre-create offscreen document:', err.message);
    });

    logger.info('processStartProctoring: Injecting overlay into tab', tab.id);
    await injectOverlay(tab.id);
    logger.info('processStartProctoring: Overlay injected successfully');

    // Guard: injectOverlay mất vài giây — nếu trong lúc đó END_PROCTORING đã chạy
    // và reset runtimeState, không tiếp tục start heartbeat để tránh zombie session.
    if (runtimeState.status !== 'active') {
      logger.warn('processStartProctoring: status changed during inject (likely ended), aborting heartbeat setup');
      return null;
    }

    logger.info('processStartProctoring: Starting heartbeat monitoring');
    await initHeartbeatSession(session.sessionId, tab.id);
    await startHeartbeatMonitoring();
    logger.info('processStartProctoring: Heartbeat monitoring started');

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
    await clearAuthSession().catch(() => { });
    throw error;
  }
}

async function handleEndProctoring(data, sender) {
  // Try runtimeState first
  let session = runtimeState.session;

  // Bug 2 fix: Service worker may have been killed and restarted (state lost).
  // Attempt to restore session from chrome.storage before giving up.
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

  // FIX #3: Guard chống double-end — nếu đang ending thì reject ngay
  if (runtimeState.status === 'ending') {
    logger.warn('handleEndProctoring: already ending, ignoring duplicate call');
    return { ok: false, status: 'error', error: 'Phiên đang được kết thúc' };
  }

  logger.info('handleEndProctoring called', {
    hasRuntimeSession: !!runtimeState.session,
    runtimeStatus: runtimeState.status,
    activeTabId: runtimeState.activeTabId,
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
  const tabId = runtimeState.activeTabId ?? session.activeTabId ?? null;
  const windowId = session.activeWindowId || sender?.tab?.windowId || runtimeState.activeWindowId;

  logger.info('processEndProctoring: Starting cleanup');

  // ── PHASE 1: Thoát fullscreen (chrome.windows API — chỉ background làm được) ──
  // Overlay đã được content script tự xóa ngay khi user bấm nút — không cần chờ ở đây.
  // exitTabFullscreen chạy ngay để window không còn bị kẹt fullscreen.
  // removeOverlayDirectly vẫn chạy song song như safety net (end từ xa, timeout, v.v.)
  await Promise.allSettled([
    exitTabFullscreen(windowId).catch((err) => {
      logger.warn('exitTabFullscreen failed (non-fatal)', err.message);
    }),
    typeof tabId === 'number'
      ? removeOverlayDirectly(tabId).catch((err) => {
          logger.warn('removeOverlayDirectly failed (non-fatal)', err.message);
        })
      : Promise.resolve(),
  ]);
  logger.info('processEndProctoring: Fullscreen exited and overlay removed');

  // ── PHASE 2: Dừng monitoring — heartbeat, camera, content features ──
  await cleanupMonitoring(tabId);
  logger.info('processEndProctoring: Monitoring stopped');

  // ── PHASE 3: Capture screenshot (sau khi thoát fullscreen để ảnh gọn hơn) ──
  const screenshotDataUrl = await captureFinalScreenshot(windowId).catch((error) => {
    logger.warn('captureFinalScreenshot failed', error.message);
    return null;
  });

  // ── PHASE 4: Backend — upload ảnh rồi finalize (trigger blockchain) ──
  // Thực hiện sau khi UX đã sạch — lỗi ở đây mới throw để caller biết.
  const screenshotUrl = await uploadFinalScreenshot(screenshotDataUrl, session).catch((error) => {
    logger.warn('uploadFinalScreenshot failed (non-fatal)', error.message);
    return null;
  });

  const endPayload = {
    endedAt,
    status: 'ended',
    reason: data?.reason || 'user_clicked_end',
    screenshotUrl,
    summary: {
      roomCode: session.roomCode,
      studentName: session.studentName,
      studentId: session.studentId,
      totalTabs: session.tabs?.length || 0,
    },
  };

  logger.info('processEndProctoring: Finalizing session on backend (trigger blockchain)');
  await apiService.finalizeSession(endPayload);
  logger.info('processEndProctoring: Backend finalize complete');

  // ── PHASE 5: Clear state + đóng offscreen ──
  await cleanupState();

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
  }).catch(() => { });

  // Cleanup camera monitor in ISOLATED world (default)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { window.__cameraMonitor?.stop?.(); } catch (e) { } },
  }).catch(() => { });

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
      } catch (e) { }
    },
  }).catch(() => { });
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
async function handleHeartbeatMessage(data) {
  try {
    if (!data?.sessionId) {
      logger.warn('Heartbeat received without sessionId');
      return { ok: false, error: 'No sessionId' };
    }

    await handleHeartbeat(data);
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
  }).catch(() => { });

  // Cleanup camera monitor in ISOLATED world (default)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { window.__cameraMonitor?.stop?.(); } catch (e) { } },
  }).catch(() => { });

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
      } catch (e) { }
    },
  }).catch(() => { });

  return { ok: true };
}

/**
 * Handle SESSION_END from content script (heartbeat.js cleanupHeartbeat).
 */
async function handleSessionEnd(data) {
  const sessionId = data?.sessionId;
  if (!sessionId) {
    logger.warn('SESSION_END received without sessionId');
    return { ok: false, error: 'No sessionId' };
  }

  logger.info('SESSION_END received — clearing heartbeat entry', { sessionId });
  await resetHeartbeatData(sessionId);
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

    try {
      await apiService.logViolation(violationData);
      return { ok: true };
    } catch (error) {
      logger.error('Failed to send violation to backend', error.message);

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

  // Offscreen document đã tự gọi loadModel() khi load (xem offscreen.js cuối file).
  // Không cần kick AI_INIT_MODEL từ đây — sẽ gây "Receiving end does not exist"
  // vì offscreen script chưa finish loading khi ensureOffscreenDocument() return.

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

        window.__extSendMessage = function (message, callback) {
          try {
            chrome.runtime.sendMessage(
              extId,
              message,
              callback || function () { chrome.runtime.lastError; }
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

  // Inject content.js safely into ISOLATED world
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content.js']
  });

  // Inject camera-monitor vào ISOLATED world
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

/**
 * Chụp màn hình tab đang active.
 */
async function captureFinalScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId || undefined,
      { format: 'jpeg', quality: 80 },
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

/**
 * Upload ảnh chụp màn hình cuối lên server qua multipart/form-data.
 */
async function uploadFinalScreenshot(dataUrl, session) {
  if (!dataUrl) return null;

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const MAX_BYTES = 800 * 1024;
  if (blob.size > MAX_BYTES) {
    logger.warn('uploadFinalScreenshot: screenshot too large, skipping upload', {
      sizeKB: Math.round(blob.size / 1024),
    });
    return null;
  }

  logger.info('uploadFinalScreenshot: Uploading screenshot', {
    sizeKB: Math.round(blob.size / 1024),
  });

  const result = await apiService.uploadScreenshot(blob, session?.sessionId);
  return result?.screenshotUrl || null;
}

async function cleanupRuntime() {
  logger.warn('cleanupRuntime called', {
    status: runtimeState.status,
    sessionId: runtimeState.session?.sessionId,
    activeTabId: runtimeState.activeTabId,
    activeWindowId: runtimeState.activeWindowId,
  });
  runtimeState.status = 'ending';
  await cleanupMonitoring(runtimeState.activeTabId);
  await cleanupState();
}

/**
 * PHASE 2 — Dừng tất cả monitoring đang chạy:
 * heartbeat, camera-monitor, content script features.
 * Không đụng runtimeState để tránh race với processStartProctoring.
 */
async function cleanupMonitoring(tabId) {
  // Dừng heartbeat alarm ngay
  logger.info('cleanupRuntime: Stopping heartbeat monitoring');
  await stopHeartbeatMonitoring();
  await clearAllHeartbeatData();

  if (typeof tabId !== 'number') return;

  // Dừng camera-monitor trực tiếp qua executeScript (không phụ thuộc messaging)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { try { window.__cameraMonitor?.stop?.(); } catch (_) { } },
  }).catch((err) => {
    logger.warn('cleanupMonitoring: stop cameraMonitor failed (non-fatal)', err.message);
  });

  // Gửi SESSION_CLEANUP để content script dọn features (belt + suspenders)
  await sendToTab(tabId, 'SESSION_CLEANUP', { reason: 'backend_ended_or_timeout' }).catch((err) => {
    logger.warn('cleanupMonitoring: SESSION_CLEANUP send failed (non-fatal)', err.message);
  });
}

/**
 * PHASE 5 — Clear toàn bộ state + đóng offscreen document.
 * Chạy sau khi backend đã xác nhận để handleAIFrame guard hoạt động đúng.
 */
async function cleanupState() {
  // Xóa CSS overlay còn sót (removeOverlayDirectly có thể đã làm, belt + suspenders)
  if (typeof runtimeState.activeTabId === 'number') {
    await chrome.scripting.removeCSS({
      target: { tabId: runtimeState.activeTabId },
      files: ['src/overlay.css'],
    }).catch(() => { });
  }

  // Clear runtime state TRƯỚC khi đóng offscreen để handleAIFrame guard hoạt động
  runtimeState.session = null;
  runtimeState.activeTabId = null;
  runtimeState.activeWindowId = null;
  await clearAuthSession().catch((err) => {
    logger.warn('cleanupState: clearAuthSession failed', err.message);
  });

  // Đợi ngắn để các AI_FRAME in-flight kịp settle trước khi đóng offscreen
  await new Promise(resolve => setTimeout(resolve, 300));

  await closeOffscreenDocument().catch((err) => {
    logger.debug('cleanupState: closeOffscreen (non-fatal)', err.message);
  });

  runtimeState.status = 'idle';
  logger.info('cleanupRuntime complete — status reset to idle');
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
      url: OFFSCREEN_URL,
      reasons: [
        chrome.offscreen.Reason.DOM_SCRAPING,
      ],
      justification: 'Run YOLO TF.js inference for AI cheating detection (canvas + WebGL)',
    });
    logger.info('[AI-BG] Offscreen document created');
  } catch (err) {
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
    logger.debug('[AI-BG] closeOffscreenDocument (already closed):', err.message);
  }
}

/**
 * Handler: AI_ENSURE_OFFSCREEN — từ camera-monitor.js content script
 */
async function handleEnsureOffscreen() {
  try {
    await ensureOffscreenDocument();
    // Offscreen tự gọi loadModel() khi document load — không cần kick AI_INIT_MODEL.
    // Gọi sendMessage ngay sau ensureOffscreenDocument() gây "Receiving end does not exist"
    // vì offscreen script chưa finish loading khi createDocument() promise resolve.
    return { ok: true };
  } catch (err) {
    logger.error('[AI-BG] handleEnsureOffscreen failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Handler: AI_FRAME — frame từ camera-monitor.js
 *
 * FIX "message port closed before a response was received":
 * chrome.runtime.sendMessage() với callback là one-shot — nếu offscreen document
 * bị unload hoặc inference chậm (CPU backend ~200-800ms), port bị đóng trước khi
 * callback nhận được kết quả và Chrome throw lỗi này.
 *
 * Giải pháp: dùng long-lived Port (chrome.runtime.connect) thay vì sendMessage.
 * Port tồn tại suốt lifetime của inference, không bị timeout bởi Chrome.
 * Thêm timeout thủ công (AI_INFERENCE_TIMEOUT_MS) để tránh treo nếu offscreen crash.
 */
const AI_INFERENCE_TIMEOUT_MS = 10000; // 10s — đủ cho CPU inference chậm nhất

async function handleAIFrame(data) {
  // Guard: reject nếu không phải 'active' (bao gồm 'ending')
  if (runtimeState.status !== 'active') {
    return { ok: false, error: 'Session ended', detections: [] };
  }

  try {
    await ensureOffscreenDocument();

    // Guard lại sau await — status có thể thay đổi trong ensureOffscreenDocument
    if (runtimeState.status !== 'active') {
      return { ok: false, error: 'Session ended', detections: [] };
    }

    return await relayInferenceViaPort(data);
  } catch (err) {
    logger.error('[AI-BG] handleAIFrame error:', err.message);
    return { ok: false, error: err.message, detections: [] };
  }
}

/**
 * Relay AI_INFERENCE đến offscreen document qua long-lived Port.
 * Port không bị Chrome đóng tự động như one-shot sendMessage,
 * nên không xảy ra "message port closed" dù inference mất vài trăm ms.
 */
function relayInferenceViaPort(data) {
  return new Promise((resolve) => {
    let settled = false;
    let port = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      try { port?.disconnect(); } catch (_) {}
      resolve(result);
    };

    // Timeout thủ công — phòng trường hợp offscreen crash không gửi response
    const timeoutId = setTimeout(() => {
      logger.warn('[AI-BG] AI_INFERENCE timeout — offscreen may have crashed');
      settle({ ok: false, error: 'inference timeout', detections: [] });
    }, AI_INFERENCE_TIMEOUT_MS);

    try {
      port = chrome.runtime.connect({ name: 'ai-inference' });
    } catch (err) {
      clearTimeout(timeoutId);
      resolve({ ok: false, error: err.message, detections: [] });
      return;
    }

    port.onMessage.addListener((result) => {
      clearTimeout(timeoutId);
      settle(result || { ok: false, detections: [] });
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timeoutId);
      const err = chrome.runtime.lastError?.message || 'port disconnected';
      // Phân biệt disconnect bình thường (sau khi đã settle) vs disconnect bất ngờ
      if (!settled) {
        logger.warn('[AI-BG] AI inference port disconnected unexpectedly:', err);
        settle({ ok: false, error: err, detections: [] });
      }
    });

    // Gửi message sau khi đã đăng ký listeners — tránh race condition
    try {
      port.postMessage({
        type: 'AI_INFERENCE',
        imageData: data.imageData,
        width: data.width,
        height: data.height,
        frameId: data.frameId,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      settle({ ok: false, error: err.message, detections: [] });
    }
  });
}

/**
 * Handler: AI_VIOLATION — khi camera-monitor phát hiện vi phạm nghiêm trọng
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
  // Restore heartbeat context ngay khi SW wake up (trước khi alarm có thể fire)
  restoreHeartbeatMap().then(() => {
    return restoreSessionContext();
  }).then(() => {
    logger.info('Background service worker initialized and session restored');
  }).catch((error) => {
    logger.warn('Background init error:', error.message);
  });

  if (chrome.runtime && chrome.runtime.onSuspend) {
    chrome.runtime.onSuspend.addListener(() => {
      logger.info('Background service worker suspended');
      closeOffscreenDocument().catch(() => { });
    });
  }
}

// ─── Alarm listener (MV3 Fix #1) ─────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'proctor-heartbeat-check') {
    handleHeartbeatAlarm().catch((error) => {
      logger.error('[HB-Monitor] handleHeartbeatAlarm failed', error.message);
    });
  }
});

// REGISTER MESSAGE LISTENER IMMEDIATELY
onMessage({
  START_PROCTORING: handleStartProctoring,
  END_PROCTORING: handleEndProctoring,
  GET_SESSION_INFO: handleGetSessionInfo,
  HEARTBEAT: handleHeartbeatMessage,
  SESSION_END: handleSessionEnd,
  LOG_VIOLATION: handleLogViolation,
  REMOVE_OVERLAY_CSS: handleRemoveOverlayCSS,
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
  if (message?.type === 'AI_STATUS') {
    chrome.runtime.sendMessage({ type: 'AI_STATUS' }, (res) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, status: 'unloaded', error: chrome.runtime.lastError.message });
      } else {
        sendResponse(res || { ok: false, status: 'unloaded' });
      }
    });
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