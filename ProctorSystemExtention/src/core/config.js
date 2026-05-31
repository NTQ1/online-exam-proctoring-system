/**
 * Configuration for Proctor System Extension
 */

// Server configuration
export const SERVER_CONFIG = {
  // Development
 development: {
  baseUrl: 'http://localhost:5001',
  apiUrl: 'http://localhost:5001/api',
  wsUrl: 'ws://localhost:5001',
},
  // Production
  production: {
    baseUrl: 'https://api.proctor-system.com',
    apiUrl: 'https://api.proctor-system.com/api',
    wsUrl: 'wss://api.proctor-system.com',
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
