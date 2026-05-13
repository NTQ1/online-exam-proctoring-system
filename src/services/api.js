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
}

// Export singleton instance
export const apiService = new APIService();

export default apiService;
