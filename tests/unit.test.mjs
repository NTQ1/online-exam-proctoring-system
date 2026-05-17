/**
 * Unit Tests - Proctor System Extension Features
 * Chạy: node tests/unit.test.mjs
 *
 * Các features được test (không cần browser/chrome API):
 *  - FR-11: block-actions key logic
 *  - FR-12: tab-switch-detector state machine
 *  - FR-13: fullscreen-monitor state machine
 *  - FR-14: devtools-detector threshold logic
 *  - FR-15: heartbeat timeout + reconnect logic
 *  - offline-queue logic
 *  - messaging envelope format
 *  - logger level filtering
 */

// ─── Mini test runner ────────────────────────────────────────────────────────
let passed = 0, failed = 0, currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(` ${name}`);
  console.log('═'.repeat(50));
}

function test(name, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r
        .then(() => { console.log(`  ✅ ${name}`); passed++; })
        .catch(e  => { console.error(`  ❌ ${name}\n     ${e.message}`); failed++; });
    }
    console.log(`  ✅ ${name}`); passed++;
  } catch(e) {
    console.error(`  ❌ ${name}\n     ${e.message}`); failed++;
  }
}

function assert(val, msg = 'assertion failed') {
  if (!val) throw new Error(msg);
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}
function assertNull(v, msg) {
  if (v !== null) throw new Error(msg || `Expected null, got ${v}`);
}

// ═══════════════════════════════════════════════════════
// FR-11: Block-Actions — Key matching logic (BUG-4 fix)
// ═══════════════════════════════════════════════════════
const DANGEROUS_KEYS = [
  { ctrlKey: true,  shiftKey: false, altKey: false, code: 'KeyP',  name: 'Ctrl+P' },
  { ctrlKey: true,  shiftKey: false, altKey: false, code: 'KeyU',  name: 'Ctrl+U' },
  { ctrlKey: false, shiftKey: false, altKey: false, code: 'F12',   name: 'F12' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyI',  name: 'Ctrl+Shift+I' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyC',  name: 'Ctrl+Shift+C' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyJ',  name: 'Ctrl+Shift+J' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyK',  name: 'Ctrl+Shift+K' },
];

function matchKey(event) {
  for (const dk of DANGEROUS_KEYS) {
    const ctrlMatch  = dk.ctrlKey  ? event.ctrlKey  : !event.ctrlKey;
    const shiftMatch = dk.shiftKey ? event.shiftKey : !event.shiftKey;
    const altMatch   = dk.altKey   ? event.altKey   : !event.altKey;
    if (event.code === dk.code && ctrlMatch && shiftMatch && altMatch) return dk.name;
  }
  return null;
}

suite('FR-11 Block-Actions — Key Matching');
test('F12 alone → blocked',         () => assert(matchKey({ code:'F12',   ctrlKey:false, shiftKey:false, altKey:false })));
test('Ctrl+P → blocked',            () => assert(matchKey({ code:'KeyP',  ctrlKey:true,  shiftKey:false, altKey:false })));
test('Ctrl+U → blocked',            () => assert(matchKey({ code:'KeyU',  ctrlKey:true,  shiftKey:false, altKey:false })));
test('Ctrl+Shift+I → blocked',      () => assert(matchKey({ code:'KeyI',  ctrlKey:true,  shiftKey:true,  altKey:false })));
test('Ctrl+Shift+C → blocked',      () => assert(matchKey({ code:'KeyC',  ctrlKey:true,  shiftKey:true,  altKey:false })));
test('Ctrl+Shift+J → blocked',      () => assert(matchKey({ code:'KeyJ',  ctrlKey:true,  shiftKey:true,  altKey:false })));
test('Ctrl+Shift+K → blocked',      () => assert(matchKey({ code:'KeyK',  ctrlKey:true,  shiftKey:true,  altKey:false })));
// Should NOT block (BUG-4)
test('[BUG-4] Shift+F12 → NOT blocked',          () => assertNull(matchKey({ code:'F12',  ctrlKey:false, shiftKey:true,  altKey:false })));
test('[BUG-4] plain P (no Ctrl) → NOT blocked',  () => assertNull(matchKey({ code:'KeyP', ctrlKey:false, shiftKey:false, altKey:false })));
test('[BUG-4] Ctrl+I (no Shift) → NOT blocked',  () => assertNull(matchKey({ code:'KeyI', ctrlKey:true,  shiftKey:false, altKey:false })));
test('[BUG-4] Ctrl+Shift+Alt+I → NOT blocked',   () => assertNull(matchKey({ code:'KeyI', ctrlKey:true,  shiftKey:true,  altKey:true  })));
test('Normal key A → NOT blocked',               () => assertNull(matchKey({ code:'KeyA', ctrlKey:false, shiftKey:false, altKey:false })));
test('Enter key → NOT blocked',                  () => assertNull(matchKey({ code:'Enter',ctrlKey:false, shiftKey:false, altKey:false })));
test('Ctrl+Z (undo) → NOT blocked',              () => assertNull(matchKey({ code:'KeyZ', ctrlKey:true,  shiftKey:false, altKey:false })));
test('Ctrl+C (copy) → NOT blocked (copy blocked via event)',
                                                 () => assertNull(matchKey({ code:'KeyC', ctrlKey:true,  shiftKey:false, altKey:false })));

// ═══════════════════════════════════════════════════════
// FR-12: Tab-Switch-Detector — state machine
// ═══════════════════════════════════════════════════════
function makeTabSwitchState() {
  return { totalAwayTime: 0, awayCount: 0, wasVisible: true, isAwayStartTime: null, violations: [] };
}

// tab becomes hidden
function tabSwitchHidden(state, now) {
  if (!state.wasVisible) return; // already away
  state.isAwayStartTime = now;
  state.awayCount++;
  state.wasVisible = false;
  state.violations.push({ type: 'TAB_AWAY', ts: now });
}

// tab becomes visible again
function tabSwitchVisible(state, now) {
  if (state.wasVisible) return; // already visible
  if (state.isAwayStartTime !== null) {
    state.totalAwayTime += now - state.isAwayStartTime;
  }
  state.wasVisible = true;
  state.isAwayStartTime = null;
  state.violations.push({ type: 'TAB_RETURN', ts: now });
}

suite('FR-12 Tab-Switch-Detector — State Machine');
test('Initial state: visible, 0 away', () => {
  const s = makeTabSwitchState();
  assertEqual(s.wasVisible, true);
  assertEqual(s.awayCount, 0);
  assertEqual(s.totalAwayTime, 0);
});
test('Hide tab → awayCount increments', () => {
  const s = makeTabSwitchState();
  tabSwitchHidden(s, 1000);
  assertEqual(s.awayCount, 1);
  assert(!s.wasVisible);
});
test('Return to tab → totalAwayTime calculated', () => {
  const s = makeTabSwitchState();
  tabSwitchHidden(s, 1000);
  tabSwitchVisible(s, 6000);
  assertEqual(s.totalAwayTime, 5000);
  assert(s.wasVisible);
  assertNull(s.isAwayStartTime);
});
test('Multiple away cycles accumulate correctly', () => {
  const s = makeTabSwitchState();
  // Cycle 1: away 3s
  tabSwitchHidden(s, 0);    tabSwitchVisible(s, 3000);
  // Cycle 2: away 2s (wasVisible was reset to true after cycle 1)
  tabSwitchHidden(s, 5000); tabSwitchVisible(s, 7000);
  assertEqual(s.awayCount, 2, `awayCount should be 2, got ${s.awayCount}`);
  assertEqual(s.totalAwayTime, 5000, `totalAwayTime should be 5000, got ${s.totalAwayTime}`);
  assertEqual(s.violations.filter(v => v.type === 'TAB_AWAY').length, 2);
});
test('Double-hidden (already away) → no double count', () => {
  const s = makeTabSwitchState();
  tabSwitchHidden(s, 1000);
  tabSwitchHidden(s, 2000); // second hidden while already away
  assertEqual(s.awayCount, 1);
});
test('Violations logged on each transition', () => {
  const s = makeTabSwitchState();
  tabSwitchHidden(s, 1000);
  tabSwitchVisible(s, 2000);
  assertEqual(s.violations.length, 2);
  assertEqual(s.violations[0].type, 'TAB_AWAY');
  assertEqual(s.violations[1].type, 'TAB_RETURN');
});

// ═══════════════════════════════════════════════════════
// FR-13: Fullscreen-Monitor — dual-mode detection
// ═══════════════════════════════════════════════════════
const TOL = 5;

// Simulate the dual-mode detectFullscreen logic
function detectFullscreen(fullscreenEl, outerH, outerW, screenH, screenW) {
  if (fullscreenEl !== null) return true;
  return (outerH >= screenH - TOL) && (outerW >= screenW - TOL);
}

function makeFullscreenState() {
  return { exitCount: 0, isInFullscreen: false, lastExitTime: null, durations: [], violations: [] };
}

function fsEvaluate(state, isNowFull, now) {
  if (state.isInFullscreen && !isNowFull) {
    // exiting fullscreen
    state.exitCount++;
    state.lastExitTime = now;
    state.isInFullscreen = false;
    state.violations.push('FULLSCREEN_EXIT');
  } else if (!state.isInFullscreen && isNowFull) {
    // restoring fullscreen
    if (state.lastExitTime !== null) {
      state.durations.push({ duration: now - state.lastExitTime });
      state.lastExitTime = null;
    }
    state.isInFullscreen = true;
    state.violations.push('FULLSCREEN_RESTORED');
  }
}

// Helper: call fsEvaluate with detectFullscreen result
function fsChange(state, fullscreenEl, outerH, outerW, screenH, screenW, now) {
  const isNowFull = detectFullscreen(fullscreenEl, outerH, outerW, screenH, screenW);
  fsEvaluate(state, isNowFull, now);
}

suite('FR-13 Fullscreen-Monitor — Dual-Mode Detection');
// JS Fullscreen API path
test('JS API: fullscreenElement → detected as fullscreen', () => {
  assert(detectFullscreen({}, 800, 1200, 900, 1400),
    'Should detect fullscreen via fullscreenElement (non-null)');
});
test('JS API: null fullscreenElement + small window → not fullscreen', () => {
  assert(!detectFullscreen(null, 800, 1200, 900, 1400));
});
// Browser-level (F11) path
test('[F11] outerH=screenH, outerW=screenW → browser fullscreen', () => {
  assert(detectFullscreen(null, 1080, 1920, 1080, 1920), 'Full match should detect');
});
test('[F11] outerH=screenH-3 (within tolerance) → still detected', () => {
  assert(detectFullscreen(null, 1077, 1917, 1080, 1920), 'Within 5px tolerance should detect');
});
test('[F11] outerH=screenH-6 (exceeds tolerance) → NOT detected', () => {
  assert(!detectFullscreen(null, 1074, 1914, 1080, 1920), 'Over 5px tolerance should NOT detect');
});
test('[F11] Only height matches, width mismatch → NOT detected', () => {
  assert(!detectFullscreen(null, 1080, 1200, 1080, 1920), 'Both dims must match');
});
// State machine
test('Exit from fullscreen → exitCount=1, violation logged', () => {
  const s = makeFullscreenState();
  s.isInFullscreen = true;
  fsChange(s, null, 800, 1200, 1080, 1920, 1000); // exits (small window)
  assertEqual(s.exitCount, 1);
  assert(s.violations.includes('FULLSCREEN_EXIT'));
});
test('Restore fullscreen → duration recorded', () => {
  const s = makeFullscreenState();
  s.isInFullscreen = true;
  fsChange(s, null, 800, 1200, 1080, 1920, 1000);  // exit
  fsChange(s, null, 1080, 1920, 1080, 1920, 4000); // restore (F11)
  assertEqual(s.durations.length, 1);
  assertEqual(s.durations[0].duration, 3000);
  assert(s.isInFullscreen);
});
test('[F11] Multiple exits via resize events → accumulates', () => {
  const s = makeFullscreenState();
  s.isInFullscreen = true;
  fsChange(s, null, 800, 1200, 1080, 1920, 0);     // exit
  fsChange(s, null, 1080, 1920, 1080, 1920, 1000); // restore
  fsChange(s, null, 800, 1200, 1080, 1920, 2000);  // exit again
  fsChange(s, null, 1080, 1920, 1080, 1920, 3000); // restore again
  assertEqual(s.exitCount, 2, `exitCount should be 2, got ${s.exitCount}`);
  assertEqual(s.durations.length, 2, `durations should have 2, got ${s.durations.length}`);
});
test('Enter full when never exited → no duration recorded', () => {
  const s = makeFullscreenState(); // not in fullscreen
  fsChange(s, null, 1080, 1920, 1080, 1920, 1000); // enter fullscreen
  assertEqual(s.durations.length, 0);
});
test('getStats totalExitTime sum', () => {
  const durations = [{ duration: 1000 }, { duration: 2500 }];
  const total = durations.reduce((sum, d) => sum + d.duration, 0);
  assertEqual(total, 3500);
});

// ═══════════════════════════════════════════════════════
// FR-14: DevTools-Detector — threshold logic
// ═══════════════════════════════════════════════════════
const WIDTH_THRESHOLD  = 160;
const HEIGHT_THRESHOLD = 100;

function isDevtoolsOpen(outerW, innerW, outerH, innerH) {
  return (outerW - innerW) > WIDTH_THRESHOLD || (outerH - innerH) > HEIGHT_THRESHOLD;
}

function makeDevtoolsState() {
  return { isOpen: false, openCount: 0, log: [], lastOpenTime: null, violations: [] };
}

function checkDevtools(state, outerW, innerW, outerH, innerH, now) {
  const open = isDevtoolsOpen(outerW, innerW, outerH, innerH);
  if (open && !state.isOpen) {
    // just opened
    state.openCount++;
    state.lastOpenTime = now;
    state.isOpen = true;
    state.violations.push('DEVTOOLS_OPEN');
  } else if (!open && state.isOpen) {
    // just closed
    if (state.lastOpenTime !== null) {
      state.log.push({ duration: now - state.lastOpenTime });
    }
    state.isOpen = false;
    state.lastOpenTime = null;
    state.violations.push('DEVTOOLS_CLOSE');
  }
}

suite('FR-14 DevTools-Detector — Threshold Logic');
test('widthDiff=161 → devtools open',  () => assert(isDevtoolsOpen(1200, 1039, 800, 800)));
test('heightDiff=101 → devtools open', () => assert(isDevtoolsOpen(1200, 1200, 900, 799)));
test('widthDiff=160 (exact) → NOT open', () => assert(!isDevtoolsOpen(1200, 1040, 800, 800)));
test('both diffs small → NOT open',    () => assert(!isDevtoolsOpen(1200, 1100, 800, 750)));
test('State: open event logged',       () => {
  const s = makeDevtoolsState();
  checkDevtools(s, 1200, 1000, 800, 800, 1000);
  assertEqual(s.openCount, 1);
  assert(s.violations.includes('DEVTOOLS_OPEN'));
});
test('State: close after open → duration recorded', () => {
  const s = makeDevtoolsState();
  // First call: devtools opens (widthDiff=200 > 160)
  checkDevtools(s, 1200, 1000, 800, 800, 0);    // OPEN at t=0
  assertEqual(s.isOpen, true, 'Should be open after first check');
  assertEqual(s.lastOpenTime, 0, 'lastOpenTime should be 0');
  // Second call: devtools closes (widthDiff=0)
  checkDevtools(s, 1200, 1200, 800, 800, 5000); // CLOSE at t=5000
  assertEqual(s.isOpen, false, 'Should be closed');
  assertEqual(s.log.length, 1, `log should have 1 entry, got ${s.log.length}`);
  assertEqual(s.log[0].duration, 5000, `duration should be 5000, got ${s.log[0].duration}`);
  assert(s.violations.includes('DEVTOOLS_CLOSE'), 'DEVTOOLS_CLOSE not in violations');
});
test('No duplicate open events while open', () => {
  const s = makeDevtoolsState();
  checkDevtools(s, 1200, 1000, 800, 800, 0);
  checkDevtools(s, 1200, 1000, 800, 800, 1000); // still open
  assertEqual(s.openCount, 1);
});
test('totalOpenTime aggregation', () => {
  const s = makeDevtoolsState();
  s.log = [{ duration: 3000 }, { duration: 7000 }];
  const total = s.log.reduce((sum, d) => sum + d.duration, 0);
  assertEqual(total, 10000);
});

// ═══════════════════════════════════════════════════════
// FR-15: Heartbeat-Monitor — timeout & reconnect (BUG-5)
// ═══════════════════════════════════════════════════════
function makeHeartbeatMap() { return {}; }

function receiveHeartbeat(map, { sessionId, tabId, timestamp }) {
  if (!map[sessionId]) {
    map[sessionId] = {
      tabId, stats: {}, connectionStatus: 'connected',
      lastDisconnectTime: null,
      lastHeartbeat: timestamp || Date.now(), // BUG-5 fix
    };
  }
  map[sessionId].lastHeartbeat = timestamp || Date.now();
  map[sessionId].tabId = tabId;
  if (map[sessionId].connectionStatus === 'disconnected') {
    map[sessionId].connectionStatus = 'connected';
    return 'reconnected';
  }
  return 'ok';
}

function checkTimeout(map, now, timeoutMs = 90000) {
  const timedOut = [];
  for (const [sid, d] of Object.entries(map)) {
    if ((now - d.lastHeartbeat) > timeoutMs && d.connectionStatus !== 'disconnected') {
      d.connectionStatus = 'disconnected';
      d.lastDisconnectTime = now;
      timedOut.push(sid);
    }
  }
  return timedOut;
}

suite('FR-15 Heartbeat-Monitor — Timeout & Reconnect');
test('[BUG-5] lastHeartbeat init → no NaN', () => {
  const map = makeHeartbeatMap();
  receiveHeartbeat(map, { sessionId: 's1', tabId: 1, timestamp: 5000 });
  assert(!isNaN(map['s1'].lastHeartbeat), 'lastHeartbeat must not be NaN');
  assertEqual(map['s1'].lastHeartbeat, 5000);
});
test('First heartbeat → connectionStatus=connected', () => {
  const map = makeHeartbeatMap();
  receiveHeartbeat(map, { sessionId: 's2', tabId: 1, timestamp: Date.now() });
  assertEqual(map['s2'].connectionStatus, 'connected');
});
test('Within 90s → no timeout', () => {
  const map = makeHeartbeatMap(); const now = Date.now();
  receiveHeartbeat(map, { sessionId: 's3', tabId: 1, timestamp: now - 30000 });
  assertEqual(checkTimeout(map, now).length, 0);
});
test('After 91s → timeout triggered', () => {
  const map = makeHeartbeatMap(); const now = Date.now();
  receiveHeartbeat(map, { sessionId: 's4', tabId: 1, timestamp: now - 91000 });
  const timedOut = checkTimeout(map, now);
  assertEqual(timedOut.length, 1);
  assertEqual(timedOut[0], 's4');
  assertEqual(map['s4'].connectionStatus, 'disconnected');
});
test('Reconnect heartbeat → status back to connected', () => {
  const map = makeHeartbeatMap(); const now = Date.now();
  receiveHeartbeat(map, { sessionId: 's5', tabId: 1, timestamp: now - 91000 });
  checkTimeout(map, now);
  assertEqual(map['s5'].connectionStatus, 'disconnected');
  const result = receiveHeartbeat(map, { sessionId: 's5', tabId: 1, timestamp: now });
  assertEqual(result, 'reconnected');
  assertEqual(map['s5'].connectionStatus, 'connected');
});
test('Multiple sessions: only stale one timed out', () => {
  const map = makeHeartbeatMap(); const now = Date.now();
  receiveHeartbeat(map, { sessionId: 'active', tabId: 1, timestamp: now - 20000 });
  receiveHeartbeat(map, { sessionId: 'stale',  tabId: 2, timestamp: now - 95000 });
  const timedOut = checkTimeout(map, now);
  assertEqual(timedOut.length, 1);
  assertEqual(timedOut[0], 'stale');
  assertEqual(map['active'].connectionStatus, 'connected');
});
test('Already disconnected → not double-reported', () => {
  const map = makeHeartbeatMap(); const now = Date.now();
  receiveHeartbeat(map, { sessionId: 's6', tabId: 1, timestamp: now - 95000 });
  checkTimeout(map, now);
  checkTimeout(map, now + 10000); // second check
  assertEqual(map['s6'].connectionStatus, 'disconnected'); // same, no double
});

// ═══════════════════════════════════════════════════════
// Offline-Queue — logic
// ═══════════════════════════════════════════════════════
function makeQueue() {
  return {}; // { [sessionId]: { logs: [], disconnectedAt } }
}

function addToQueue(q, sessionId, log) {
  if (!q[sessionId]) q[sessionId] = { sessionId, logs: [], disconnectedAt: Date.now() };
  q[sessionId].logs.push({ ...log, timestamp: log.timestamp || Date.now() });
}

function flushQueue(q, sessionId) {
  const data = q[sessionId];
  if (!data || !data.logs.length) return null;
  const payload = { ...data };
  delete q[sessionId];
  return payload;
}

suite('Offline-Queue — Logic');
test('Add to empty queue → creates entry', () => {
  const q = makeQueue();
  addToQueue(q, 'sess', { type: 'VIOLATION', violationType: 'COPY' });
  assertEqual(q['sess'].logs.length, 1);
});
test('Add multiple → all stored', () => {
  const q = makeQueue();
  addToQueue(q, 'sess', { type: 'HEARTBEAT' });
  addToQueue(q, 'sess', { type: 'VIOLATION', violationType: 'TAB_AWAY' });
  addToQueue(q, 'sess', { type: 'VIOLATION', violationType: 'DEVTOOLS_OPEN' });
  assertEqual(q['sess'].logs.length, 3);
});
test('Flush → returns payload and clears queue', () => {
  const q = makeQueue();
  addToQueue(q, 'sess', { type: 'VIOLATION', violationType: 'COPY' });
  const payload = flushQueue(q, 'sess');
  assert(payload !== null);
  assertEqual(payload.logs.length, 1);
  assert(!q['sess'], 'Queue should be cleared after flush');
});
test('Flush empty queue → returns null', () => {
  const q = makeQueue();
  assertNull(flushQueue(q, 'nonexistent'));
});
test('Multiple sessions independent', () => {
  const q = makeQueue();
  addToQueue(q, 'A', { type: 'HEARTBEAT' });
  addToQueue(q, 'A', { type: 'HEARTBEAT' });
  addToQueue(q, 'B', { type: 'VIOLATION', violationType: 'COPY' });
  assertEqual(q['A'].logs.length, 2);
  assertEqual(q['B'].logs.length, 1);
  flushQueue(q, 'A');
  assert(!q['A']);
  assert(q['B']); // B unaffected
});
test('Log timestamp auto-filled if missing', () => {
  const q = makeQueue();
  addToQueue(q, 'sess', { type: 'VIOLATION' }); // no timestamp
  assert(typeof q['sess'].logs[0].timestamp === 'number');
});

// ═══════════════════════════════════════════════════════
// Messaging — envelope format
// ═══════════════════════════════════════════════════════
function createEnvelope(type, data) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type, source: 'test', ts: Date.now(), data,
  };
}

suite('Messaging — Envelope Format');
test('Envelope has required fields', () => {
  const env = createEnvelope('GET_SESSION_INFO', null);
  assert(env.id, 'id required');
  assert(env.type === 'GET_SESSION_INFO', 'type required');
  assert(env.ts > 0, 'ts required');
});
test('Envelope id is unique', () => {
  const ids = new Set(Array.from({ length: 100 }, () => createEnvelope('X', null).id));
  assertEqual(ids.size, 100);
});
test('Envelope data preserved', () => {
  const env = createEnvelope('LOG_VIOLATION', { type: 'COPY', severity: 'high' });
  assertEqual(env.data.type, 'COPY');
  assertEqual(env.data.severity, 'high');
});
test('Null data allowed', () => {
  const env = createEnvelope('GET_SESSION_INFO', null);
  assertNull(env.data);
});

// ═══════════════════════════════════════════════════════
// Logger — level filtering
// ═══════════════════════════════════════════════════════
const LOG_LEVEL = { debug: 0, info: 1, warn: 2, error: 3 };

function makeLogger() {
  let level = LOG_LEVEL.info;
  const calls = [];
  return {
    setLevel: (l) => { level = LOG_LEVEL[l] ?? LOG_LEVEL.info; },
    log: (l, msg) => { if (LOG_LEVEL[l] >= level) calls.push({ l, msg }); },
    getCalls: () => calls,
  };
}

suite('Logger — Level Filtering');
test('Default level=info: debug suppressed', () => {
  const log = makeLogger();
  log.log('debug', 'hidden'); log.log('info', 'visible');
  assertEqual(log.getCalls().length, 1);
  assertEqual(log.getCalls()[0].l, 'info');
});
test('Level=debug: all logs pass', () => {
  const log = makeLogger(); log.setLevel('debug');
  log.log('debug', 'd'); log.log('info', 'i'); log.log('warn', 'w'); log.log('error', 'e');
  assertEqual(log.getCalls().length, 4);
});
test('Level=error: only errors pass', () => {
  const log = makeLogger(); log.setLevel('error');
  log.log('debug', 'd'); log.log('info', 'i'); log.log('warn', 'w'); log.log('error', 'e');
  assertEqual(log.getCalls().length, 1);
});
test('Warn passes at warn level', () => {
  const log = makeLogger(); log.setLevel('warn');
  log.log('info', 'i'); log.log('warn', 'w'); log.log('error', 'e');
  assertEqual(log.getCalls().length, 2);
});

// ═══════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════
// Wait for all async tests to finish
setTimeout(() => {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(50));
  if (failed === 0) {
    console.log('\n🎉 ALL UNIT TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log(`\n💥 ${failed} TEST(S) FAILED\n`);
    process.exit(1);
  }
}, 500);
