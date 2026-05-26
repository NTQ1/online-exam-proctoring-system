/**
 * API Service for Server Communication
 */

import { logger } from '../core/logger.js';
import { SERVER_CONFIG, TIMEOUT_CONFIG } from '../core/config.js';

const VALID_SERVER_PROTOCOLS = new Set(['http:', 'https:']);

class APIService {
  constructor() {
    this.serverUrl = SERVER_CONFIG.development.baseUrl;
    this.token = null;
    this.sessionId = null;
  }

  /**
   * Set authentication token
   */
  setAuth(token, sessionId) {
    this.token = token;
    this.sessionId = sessionId;
  }

  /**
   * Set server base URL
   */
  setServerUrl(serverUrl) {
    if (!serverUrl) return;

    let nextUrl = String(serverUrl).trim();

    try {
      const parsed = new URL(nextUrl);
      if (!VALID_SERVER_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`Unsupported protocol: ${parsed.protocol}`);
      }
      nextUrl = parsed.origin + parsed.pathname;
    } catch (error) {
      logger.warn('Ignoring unsupported serverUrl, falling back to development base', {
        serverUrl: nextUrl,
        error: error.message,
      });
      nextUrl = SERVER_CONFIG.development.baseUrl;
    }

    this.serverUrl = nextUrl.endsWith('/api') ? nextUrl.slice(0, -4) : nextUrl;
  }

  getServerUrl() {
    return this.serverUrl;
  }

  getApiBaseUrl() {
    return `${this.serverUrl.replace(/\/$/, '')}/api`;
  }

  /**
   * Make API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.getApiBaseUrl()}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    // Add timeout
    const timeoutMs = options.timeout || TIMEOUT_CONFIG.SERVER_SYNC;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug('API Request', { url, method: options.method || 'GET' });

      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      logger.debug('API Response', { url, status: response.status });

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error('API Request failed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Authenticate room code
   */
  async authenticateRoomCode(roomCode, studentName, studentId) {
    return this.request('/auth/room-code', {
      method: 'POST',
      body: JSON.stringify({
        roomCode,
        studentName,
        studentId,
        timestamp: Date.now(),
      }),
      timeout: TIMEOUT_CONFIG.AUTHENTICATION,
    });
  }

  /**
   * Start proctoring session
   */
  async startSession(payload) {
    return this.request('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        ...payload,
      }),
    });
  }

  /**
   * Prepare auth context after a successful login
   */
  setSessionContext({ token, sessionId } = {}) {
    this.setAuth(token || null, sessionId || null);
  }

  /**
   * Set server and session context together
   */
  setContext({ serverUrl, token, sessionId } = {}) {
    this.setServerUrl(serverUrl);
    this.setSessionContext({ token, sessionId });
  }

  /**
   * Report violation
   */
  async reportViolation(violationType, details) {
    return this.request('/violations/report', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        violationType,
        timestamp: Date.now(),
        details: details || {},
      }),
    });
  }

  /**
   * Send heartbeat
   */
  async sendHeartbeat() {
    return this.request('/sessions/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        timestamp: Date.now(),
      }),
    });
  }

  /**
   * Get session status
   */
  async getSessionStatus() {
    return this.request(`/sessions/${this.sessionId}`, {
      method: 'GET',
    });
  }

  /**
   * End session
   */
  async endSession(result) {
    return this.request('/sessions/end', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        result,
        timestamp: Date.now(),
      }),
    });
  }

  /**
   * Kết thúc phiên thi hợp lệ — trigger hash + ghi blockchain trên backend.
   * Chỉ gọi khi sinh viên thực sự nộp bài (không dùng cho rollback/error paths).
   * @param {Object} param
   * @param {number} param.endedAt            - timestamp kết thúc
   * @param {string} param.reason             - lý do kết thúc ('user_clicked_end', v.v.)
   * @param {string|null} param.screenshotDataUrl - ảnh chụp màn hình cuối
   * @param {Object} param.summary            - tóm tắt phiên (roomCode, studentName, ...)
   */
  async finalizeSession({ endedAt, reason, screenshotDataUrl, summary }) {
    return this.request('/sessions/finalize', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        endedAt,
        endReason: reason,
        screenshotDataUrl,
        summary,
        triggerBlockchain: true,
        timestamp: Date.now(),
      }),
      timeout: TIMEOUT_CONFIG.SERVER_SYNC,
    });
  }

  /**
   * Batch report violations
   */
  async reportViolationsBatch(violations) {
    return this.request('/violations/batch', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        violations,
        timestamp: Date.now(),
      }),
    });
  }

  /**
   * Log violation với format chuẩn từ proctoring system
   * @param {Object} violationData - { sessionId, type, timestamp, severity, details }
   */
  async logViolation(violationData) {
    return this.request('/violations', {
      method: 'POST',
      body: JSON.stringify({
        ...violationData,
        sessionId: violationData.sessionId || this.sessionId,
      }),
    });
  }

  /**
   * Báo cáo mất kết nối
   * @param {Object} data - { sessionId, tabId, reason, timestamp }
   */
  async reportDisconnection(data) {
    return this.request('/session/disconnect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Gửi offline logs khi kết nối phục hồi
   * @param {Object} data - { sessionId, logs, disconnectedAt, reconnectedAt, totalOfflineDuration }
   */
  async flushOfflineLogs(data) {
    return this.request('/offline-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Health check backend
   */
  async healthCheck() {
    try {
      const response = await this.request('/health', { method: 'GET' });
      return response?.ok === true;
    } catch (error) {
      logger.debug('Health check failed', error.message);
      return false;
    }
  }

  /**
   * Báo cáo vi phạm AI (phone / student cheating) kèm ảnh chụp.
   * @param {Array}  detections   - mảng Detection objects từ YOLO
   * @param {string} imageDataUrl - base64 JPEG ảnh chụp tại thời điểm vi phạm
   */
  async reportAIViolation(detections, imageDataUrl) {
    return this.request('/ai-violations', {
      method: 'POST',
      body: JSON.stringify({
        sessionId:    this.sessionId,
        detections,
        imageDataUrl, // base64 JPEG — backend lưu để giám thị xem lại
        timestamp:    Date.now(),
      }),
      timeout: TIMEOUT_CONFIG.SERVER_SYNC,
    });
  }
}

// Export singleton instance
export const apiService = new APIService();

export default apiService;
