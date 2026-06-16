/**
 * Configuration for Proctor System Extension
 */

// ─────────────────────────────────────────────────────────
// ⚙️  ĐỔI ĐỊA CHỈ SERVER Ở ĐÂY — chỉ cần sửa 1 dòng duy nhất
//    VPS:       'https://your-domain.com'  hoặc  'http://103.x.x.x:5001'
//    Dev local: 'http://localhost:5001'
// ─────────────────────────────────────────────────────────
const SERVER_HOST = 'http://172.26.12.45:5001'

// Server configuration
export const SERVER_CONFIG = {
  development: {
    baseUrl: SERVER_HOST,
    apiUrl: `${SERVER_HOST}/api`,
    wsUrl: SERVER_HOST.replace(/^https/, 'wss').replace(/^http/, 'ws'),
  },
  production: {
    baseUrl: SERVER_HOST,
    apiUrl: `${SERVER_HOST}/api`,
    wsUrl: SERVER_HOST.replace(/^https/, 'wss').replace(/^http/, 'ws'),
  },
};

// Get current environment
export const ENV = 'development';

// Get current server config
export const CURRENT_SERVER = SERVER_CONFIG[ENV];

// Timeout configurations
export const TIMEOUT_CONFIG = {
  AUTHENTICATION: 8000,
  SERVER_SYNC: 5000,
  // finalizeSession triggers blockchain — give it more headroom
  FINALIZE: 45000,
  TAB_RESPONSE: 3000,
};

// Violation settings
export const VIOLATION_CONFIG = {
  ENABLED_VIOLATIONS: [
    'TAB_SWITCH',
    'KEYBOARD_SHORTCUT',
    'DEVTOOLS_ATTEMPT',
    'RIGHT_CLICK',
    'WINDOW_BLUR',
    'TAB_HIDDEN',
    'PAGE_UNLOAD',
  ],
  AUTO_SUBMIT_AFTER_VIOLATIONS: 3,
  WARNING_THRESHOLD: 2,
};

// Monitoring settings
export const MONITORING_CONFIG = {
  ENABLE_AUDIO: false,
  ENABLE_VIDEO: false,
  ENABLE_SCREEN_CAPTURE: false,
  ENABLE_FACE_DETECTION: false,
  SYNC_INTERVAL: 30000, // 30 seconds
  HEARTBEAT_INTERVAL: 15000, // 15 seconds
};

export default {
  SERVER_CONFIG,
  ENV,
  CURRENT_SERVER,
  TIMEOUT_CONFIG,
  VIOLATION_CONFIG,
  MONITORING_CONFIG,
};
