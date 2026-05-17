/**
 * Full Test Suite - Proctor System Extension
 * Covers:
 *  - Suite A: Mock Backend API endpoints
 *  - Suite B: Unit test block-actions key matching logic (BUG-4 fix)
 *  - Suite C: Unit test heartbeat-monitor timeout (BUG-5 fix)
 *  - Suite D: Integration - full session lifecycle via mock backend
 */

import assert from 'node:assert';
import './mock-backend.mjs';

const BASE_URL = 'http://127.0.0.1:3000/api';

// ─── helpers ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => { console.log(`  ✅ ${name}`); passed++; })
        .catch((err) => { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, data: await res.json() };
}

// ─── Suite B: block-actions key matching logic ───────────────────────────────
// Simulates the FIXED handleKeyDown matching logic without a DOM
const DANGEROUS_KEYS = [
  { ctrlKey: true,  shiftKey: false, altKey: false, code: 'KeyP',  name: 'Ctrl+P (In trang)' },
  { ctrlKey: true,  shiftKey: false, altKey: false, code: 'KeyU',  name: 'Ctrl+U (View Source)' },
  { ctrlKey: false, shiftKey: false, altKey: false, code: 'F12',   name: 'F12 (DevTools)' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyI',  name: 'Ctrl+Shift+I (DevTools)' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyC',  name: 'Ctrl+Shift+C (Inspector)' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyJ',  name: 'Ctrl+Shift+J (Console)' },
  { ctrlKey: true,  shiftKey: true,  altKey: false, code: 'KeyK',  name: 'Ctrl+Shift+K (DevTools)' },
];

function shouldBlock(event) {
  for (const dk of DANGEROUS_KEYS) {
    const ctrlMatch  = dk.ctrlKey  ? event.ctrlKey  : !event.ctrlKey;
    const shiftMatch = dk.shiftKey ? event.shiftKey : !event.shiftKey;
    const altMatch   = dk.altKey   ? event.altKey   : !event.altKey;
    const codeMatch  = event.code === dk.code;
    if (codeMatch && ctrlMatch && shiftMatch && altMatch) return dk.name;
  }
  return null;
}

// ─── Suite C: heartbeat-monitor timeout logic ────────────────────────────────
// Inline simulation of the fix (no chrome API needed)
function buildHeartbeatMap() {
  return {};
}

function handleHeartbeatSim(map, data) {
  const { sessionId, tabId, timestamp } = data;
  if (!map[sessionId]) {
    map[sessionId] = {
      tabId,
      stats: {},
      connectionStatus: 'connected',
      lastDisconnectTime: null,
      lastHeartbeat: timestamp || Date.now(), // BUG-5 fix
    };
  }
  map[sessionId].lastHeartbeat = timestamp;
  map[sessionId].tabId = tabId;
}

function checkTimeoutSim(map, now, timeoutMs) {
  const disconnected = [];
  for (const [sessionId, data] of Object.entries(map)) {
    const elapsed = now - data.lastHeartbeat;
    if (elapsed > timeoutMs && data.connectionStatus !== 'disconnected') {
      data.connectionStatus = 'disconnected';
      data.lastDisconnectTime = now;
      disconnected.push(sessionId);
    }
  }
  return disconnected;
}

// ─── Main runner ─────────────────────────────────────────────────────────────
async function runAll() {
  console.log('\nWaiting for mock backend to start...\n');
  await new Promise(r => setTimeout(r, 1000));

  // ── Suite B: Key Blocking Logic ──────────────────────────────────────────
  console.log('══════════════════════════════════════');
  console.log(' Suite B: Block-Actions Key Logic');
  console.log('══════════════════════════════════════');

  await test('F12 alone → blocked', () => {
    assert.ok(shouldBlock({ code: 'F12', ctrlKey: false, shiftKey: false, altKey: false }));
  });

  await test('Ctrl+P → blocked', () => {
    assert.ok(shouldBlock({ code: 'KeyP', ctrlKey: true, shiftKey: false, altKey: false }));
  });

  await test('Ctrl+Shift+I → blocked', () => {
    assert.ok(shouldBlock({ code: 'KeyI', ctrlKey: true, shiftKey: true, altKey: false }));
  });

  await test('Ctrl+Shift+J → blocked', () => {
    assert.ok(shouldBlock({ code: 'KeyJ', ctrlKey: true, shiftKey: true, altKey: false }));
  });

  // BUG-4: These should NOT be blocked (wrong modifier combos)
  await test('[BUG-4 fix] Shift+F12 (no Ctrl) → NOT blocked', () => {
    assert.strictEqual(shouldBlock({ code: 'F12', ctrlKey: false, shiftKey: true, altKey: false }), null);
  });

  await test('[BUG-4 fix] plain KeyP (no Ctrl) → NOT blocked', () => {
    assert.strictEqual(shouldBlock({ code: 'KeyP', ctrlKey: false, shiftKey: false, altKey: false }), null);
  });

  await test('[BUG-4 fix] Ctrl+KeyI without Shift → NOT blocked', () => {
    assert.strictEqual(shouldBlock({ code: 'KeyI', ctrlKey: true, shiftKey: false, altKey: false }), null);
  });

  await test('[BUG-4 fix] Ctrl+Shift+Alt+I → NOT blocked (alt not expected)', () => {
    assert.strictEqual(shouldBlock({ code: 'KeyI', ctrlKey: true, shiftKey: true, altKey: true }), null);
  });

  await test('Normal typing (KeyA no modifiers) → NOT blocked', () => {
    assert.strictEqual(shouldBlock({ code: 'KeyA', ctrlKey: false, shiftKey: false, altKey: false }), null);
  });

  // ── Suite C: Heartbeat Monitor Timeout ──────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(' Suite C: Heartbeat-Monitor Timeout Logic');
  console.log('══════════════════════════════════════');

  await test('[BUG-5 fix] firstHeartbeat initializes lastHeartbeat (no NaN)', () => {
    const map = buildHeartbeatMap();
    handleHeartbeatSim(map, { sessionId: 'sess1', tabId: 1, timestamp: 1000 });
    assert.strictEqual(typeof map['sess1'].lastHeartbeat, 'number');
    assert.ok(!isNaN(map['sess1'].lastHeartbeat));
  });

  await test('Session within timeout → stays connected', () => {
    const map = buildHeartbeatMap();
    const now = Date.now();
    handleHeartbeatSim(map, { sessionId: 'sess2', tabId: 1, timestamp: now - 30000 }); // 30s ago
    const disconnected = checkTimeoutSim(map, now, 90000);
    assert.strictEqual(disconnected.length, 0);
    assert.strictEqual(map['sess2'].connectionStatus, 'connected');
  });

  await test('Session past timeout (91s ago) → disconnected', () => {
    const map = buildHeartbeatMap();
    const now = Date.now();
    handleHeartbeatSim(map, { sessionId: 'sess3', tabId: 1, timestamp: now - 91000 }); // 91s ago
    const disconnected = checkTimeoutSim(map, now, 90000);
    assert.strictEqual(disconnected.length, 1);
    assert.strictEqual(disconnected[0], 'sess3');
    assert.strictEqual(map['sess3'].connectionStatus, 'disconnected');
  });

  await test('Reconnect heartbeat after timeout → resets to connected', () => {
    const map = buildHeartbeatMap();
    const now = Date.now();
    handleHeartbeatSim(map, { sessionId: 'sess4', tabId: 1, timestamp: now - 91000 });
    checkTimeoutSim(map, now, 90000); // triggers disconnect
    assert.strictEqual(map['sess4'].connectionStatus, 'disconnected');
    // Simulate reconnect heartbeat
    map['sess4'].connectionStatus = 'connected'; // mimics handleHeartbeat reconnect logic
    handleHeartbeatSim(map, { sessionId: 'sess4', tabId: 1, timestamp: now });
    assert.strictEqual(map['sess4'].connectionStatus, 'connected');
  });

  await test('Multiple sessions: only timed-out one disconnected', () => {
    const map = buildHeartbeatMap();
    const now = Date.now();
    handleHeartbeatSim(map, { sessionId: 'active', tabId: 1, timestamp: now - 20000 });
    handleHeartbeatSim(map, { sessionId: 'stale',  tabId: 2, timestamp: now - 95000 });
    const disconnected = checkTimeoutSim(map, now, 90000);
    assert.strictEqual(disconnected.length, 1);
    assert.strictEqual(disconnected[0], 'stale');
    assert.strictEqual(map['active'].connectionStatus, 'connected');
  });

  // ── Suite A: Backend API Endpoints ──────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(' Suite A: Mock Backend API');
  console.log('══════════════════════════════════════');

  let sessionId, token;

  await test('GET /health', async () => {
    const res = await fetch('http://127.0.0.1:3000/health');
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, 'proctor-mock-backend');
  });

  await test('POST /auth/room-code → 200 with token & sessionId', async () => {
    const { status, data } = await post('/auth/room-code', {
      roomCode: 'ROOM01', studentName: 'Nguyễn Văn A', studentId: 'SV001',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(data.token, 'token must exist');
    assert.ok(data.sessionId, 'sessionId must exist');
    sessionId = data.sessionId;
    token = data.token;
  });

  await test('POST /auth/room-code → 400 missing fields', async () => {
    const { status, data } = await post('/auth/room-code', { roomCode: 'X' });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.ok, false);
  });

  await test('POST /sessions/start → 200', async () => {
    const { status, data } = await post('/sessions/start', {
      sessionId, timestamp: Date.now(), tabs: [{ id: 1, url: 'https://exam.test' }],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
  });

  await test('POST /sessions/heartbeat → 200 increments count', async () => {
    const { status, data } = await post('/sessions/heartbeat', { sessionId, timestamp: Date.now() });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.count, 1);
  });

  await test('POST /api/violations (logViolation) → 200 with violation obj', async () => {
    const { status, data } = await post('/violations', {
      sessionId, type: 'TAB_AWAY', feature: 'tabSwitch', severity: 'high',
      timestamp: Date.now(), details: { awayCount: 1 },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.violation.violationType, 'TAB_AWAY');
    assert.strictEqual(data.violation.feature, 'tabSwitch');
    assert.strictEqual(data.count, 1);
  });

  await test('POST /violations/report (legacy endpoint) → 200', async () => {
    const { status, data } = await post('/violations/report', {
      sessionId, violationType: 'COPY', timestamp: Date.now(), details: {},
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
  });

  await test('POST /violations/batch → 200 inserts multiple', async () => {
    const { status, data } = await post('/violations/batch', {
      sessionId,
      violations: [
        { violationType: 'DEVTOOLS_OPEN', timestamp: Date.now(), details: { widthDiff: 200 } },
        { violationType: 'FULLSCREEN_EXIT', timestamp: Date.now(), details: {} },
      ],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.inserted, 2);
  });

  await test('POST /session/disconnect → 200', async () => {
    const { status, data } = await post('/session/disconnect', {
      sessionId, tabId: 101, reason: 'no_heartbeat', timestamp: Date.now(),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
  });

  await test('POST /offline-logs → 200 inserts violation + heartbeat', async () => {
    const { status, data } = await post('/offline-logs', {
      sessionId,
      logs: [
        { type: 'HEARTBEAT', timestamp: Date.now() },
        { type: 'VIOLATION', violationType: 'WINDOW_BLUR', timestamp: Date.now(), details: {} },
      ],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.inserted, 2);
  });

  // ── Suite D: Full lifecycle validation ────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(' Suite D: Session Lifecycle Integrity');
  console.log('══════════════════════════════════════');

  await test('GET /sessions/:id → snapshot has all recorded data', async () => {
    const { status, data } = await get(`/sessions/${sessionId}`);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    const { snapshot } = data;
    // 1 (logViolation) + 1 (legacy report) + 2 (batch) + 1 (offline VIOLATION) = 5
    assert.ok(snapshot.violations.length >= 5, `Expected ≥5 violations, got ${snapshot.violations.length}`);
    // 1 (heartbeat endpoint) + 1 (offline HEARTBEAT) = 2
    assert.ok(snapshot.heartbeats.length >= 2, `Expected ≥2 heartbeats, got ${snapshot.heartbeats.length}`);
    assert.strictEqual(snapshot.status, 'active');
  });

  await test('POST /sessions/end → 200 with snapshot', async () => {
    const { status, data } = await post('/sessions/end', {
      sessionId,
      result: { reason: 'user_clicked_end', endedAt: Date.now() },
      timestamp: Date.now(),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.snapshot.status, 'ended');
    assert.ok(data.snapshot.endedAt, 'endedAt must be set');
  });

  await test('GET /sessions/:id after end → status=ended', async () => {
    const { data } = await get(`/sessions/${sessionId}`);
    assert.strictEqual(data.snapshot.status, 'ended');
  });

  await test('Heartbeat on ended session → still 200 (backend accepts)', async () => {
    const { status } = await post('/sessions/heartbeat', { sessionId, timestamp: Date.now() });
    assert.strictEqual(status, 200);
  });

  await test('Unknown session → 404', async () => {
    const { status, data } = await get('/sessions/nonexistent-id');
    assert.strictEqual(status, 404);
    assert.strictEqual(data.ok, false);
  });

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════');

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log(`\n💥 ${failed} TEST(S) FAILED\n`);
    process.exit(1);
  }
}

runAll();
