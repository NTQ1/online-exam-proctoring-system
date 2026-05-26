/**
 * Content Script Loader
 * - Import và khởi tạo tất cả feature modules
 * - Entry point cho injection vào page
 */

// Import feature modules
import { initBlockActions, cleanupBlockActions, resetBlockActionsCount, getBlockActionsCount } from './features/block-actions.js';
import { initTabSwitchDetector, cleanupTabSwitchDetector, getAwayStats } from './features/tab-switch-detector.js';
import { initFullscreenMonitor, cleanupFullscreenMonitor, getFullscreenStats } from './features/fullscreen-monitor.js';
import { initDevtoolsDetector, cleanupDevtoolsDetector, getDevtoolsStats } from './features/devtools-detector.js';
import { initHeartbeat, cleanupHeartbeat } from './features/heartbeat.js';

// Import content main
import { 
  bootstrap,
  handleSessionCleanup,
  sendToBackground,
  removeOverlay,
} from './content.js';

// Export features untuk global access
window.__proctoringFeatures = {
  blockActions: { initBlockActions, cleanupBlockActions, getBlockActionsCount, resetBlockActionsCount },
  tabSwitch: { initTabSwitchDetector, cleanupTabSwitchDetector, getAwayStats },
  fullscreen: { initFullscreenMonitor, cleanupFullscreenMonitor, getFullscreenStats },
  devtools: { initDevtoolsDetector, cleanupDevtoolsDetector, getDevtoolsStats },
  heartbeat: { initHeartbeat, cleanupHeartbeat },
};

// Export helpers
window.__proctoringHelpers = {
  handleSessionCleanup,
  sendToBackground,
  removeOverlay,
};

// Khởi chạy bootstrap
bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
});
