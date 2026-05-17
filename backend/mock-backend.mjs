import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const sessions = new Map();
const authRecords = new Map();

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function createToken(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function buildSessionSnapshot(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    roomCode: session.roomCode,
    studentName: session.studentName,
    studentId: session.studentId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    tabs: session.tabs,
    client: session.client,
    authToken: session.authToken,
    updatedAt: session.updatedAt,
    endPayload: session.endPayload || null,
    violations: session.violations,
    heartbeats: session.heartbeats,
  };
}

async function handleAuthRoomCode(req, res) {
  const body = await parseBody(req);
  const { roomCode, studentName, studentId } = body;

  if (!roomCode || !studentName || !studentId) {
    jsonResponse(res, 400, {
      ok: false,
      message: 'roomCode, studentName and studentId are required',
    });
    return;
  }

  const sessionId = createToken('session');
  const token = createToken('token');
  const serverUrl = `http://localhost:${PORT}`;

  authRecords.set(sessionId, {
    sessionId,
    roomCode,
    studentName,
    studentId,
    token,
    serverUrl,
    createdAt: Date.now(),
  });

  sessions.set(sessionId, {
    sessionId,
    roomCode,
    studentName,
    studentId,
    authToken: token,
    serverUrl,
    status: 'authenticated',
    startedAt: null,
    endedAt: null,
    tabs: [],
    client: null,
    heartbeats: [],
    violations: [],
    updatedAt: Date.now(),
    endPayload: null,
  });

  jsonResponse(res, 200, {
    ok: true,
    token,
    sessionId,
    serverUrl,
    message: 'Authentication accepted',
  });
}

async function handleStartSession(req, res) {
  const body = await parseBody(req);
  const { sessionId, roomCode, studentName, studentId, tabs = [], timestamp, client = {} } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  session.status = 'active';
  session.roomCode = roomCode || session.roomCode;
  session.studentName = studentName || session.studentName;
  session.studentId = studentId || session.studentId;
  session.startedAt = timestamp || Date.now();
  session.tabs = Array.isArray(tabs) ? tabs : [];
  session.client = client;
  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    startedAt: session.startedAt,
    tabsCount: session.tabs.length,
    message: 'Session started',
  });
}

async function handleEndSession(req, res) {
  const body = await parseBody(req);
  const { sessionId, result = {}, timestamp } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  session.status = 'ended';
  session.endedAt = timestamp || Date.now();
  session.endPayload = result;
  session.updatedAt = Date.now();

  const snapshot = buildSessionSnapshot(sessionId);

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    endedAt: session.endedAt,
    snapshot,
    message: 'Session ended',
  });
}

async function handleHeartbeat(req, res) {
  const body = await parseBody(req);
  const { sessionId, timestamp } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  session.heartbeats.push(timestamp || Date.now());
  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    heartbeatAt: session.heartbeats[session.heartbeats.length - 1],
    count: session.heartbeats.length,
  });
}

async function handleViolationReport(req, res) {
  const body = await parseBody(req);
  const { sessionId, violationType, timestamp, details = {} } = body;

  if (!sessionId || !violationType) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId and violationType are required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  const violation = {
    id: createToken('violation'),
    violationType,
    timestamp: timestamp || Date.now(),
    details,
  };

  session.violations.push(violation);
  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    violation,
    count: session.violations.length,
  });
}

async function handleViolationBatch(req, res) {
  const body = await parseBody(req);
  const { sessionId, violations = [], timestamp } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  const normalized = Array.isArray(violations)
    ? violations.map((item) => ({
        id: item.id || createToken('violation'),
        violationType: item.violationType || 'UNKNOWN',
        timestamp: item.timestamp || Date.now(),
        details: item.details || {},
      }))
    : [];

  session.violations.push(...normalized);
  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    inserted: normalized.length,
    timestamp: timestamp || Date.now(),
    count: session.violations.length,
  });
}

async function handleLogViolation(req, res) {
  const body = await parseBody(req);
  const { sessionId, type, feature, timestamp, severity, details = {} } = body;

  if (!sessionId || !type) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId and type are required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  const violation = {
    id: createToken('violation'),
    violationType: type,
    feature,
    severity: severity || 'warning',
    timestamp: timestamp || Date.now(),
    details,
  };

  session.violations.push(violation);
  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    violation,
    count: session.violations.length,
  });
}

async function handleDisconnect(req, res) {
  const body = await parseBody(req);
  const { sessionId, tabId, reason, timestamp } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    message: 'Disconnection reported',
  });
}

async function handleOfflineLogs(req, res) {
  const body = await parseBody(req);
  const { sessionId, logs = [] } = body;

  if (!sessionId) {
    jsonResponse(res, 400, { ok: false, message: 'sessionId is required' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  const normalized = Array.isArray(logs) ? logs : [];
  
  for (const log of normalized) {
    if (log.type === 'VIOLATION' || log.violationType) {
      session.violations.push({
        id: createToken('violation'),
        violationType: log.type || log.violationType || 'UNKNOWN',
        timestamp: log.timestamp || Date.now(),
        details: log.details || {},
      });
    } else if (log.type === 'HEARTBEAT') {
      session.heartbeats.push(log.timestamp || Date.now());
    }
  }

  session.updatedAt = Date.now();

  jsonResponse(res, 200, {
    ok: true,
    sessionId,
    inserted: normalized.length,
    message: 'Offline logs synced',
  });
}

function handleGetSession(req, res, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    jsonResponse(res, 404, { ok: false, message: 'Session not found' });
    return;
  }

  jsonResponse(res, 200, {
    ok: true,
    snapshot: buildSessionSnapshot(sessionId),
  });
}

function handleHealth(req, res) {
  jsonResponse(res, 200, {
    ok: true,
    service: 'proctor-mock-backend',
    port: PORT,
    sessions: sessions.size,
    authRecords: authRecords.size,
    now: Date.now(),
  });
}

function handleNotFound(res) {
  jsonResponse(res, 404, {
    ok: false,
    message: 'Not found',
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      handleHealth(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/room-code') {
      await handleAuthRoomCode(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sessions/start') {
      await handleStartSession(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sessions/end') {
      await handleEndSession(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sessions/heartbeat') {
      await handleHeartbeat(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/violations/report') {
      await handleViolationReport(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/violations/batch') {
      await handleViolationBatch(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/violations') {
      await handleLogViolation(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/session/disconnect') {
      await handleDisconnect(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/offline-logs') {
      await handleOfflineLogs(req, res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/sessions/')) {
      const sessionId = pathname.split('/').pop();
      handleGetSession(req, res, sessionId);
      return;
    }

    handleNotFound(res);
  } catch (error) {
    jsonResponse(res, 500, {
      ok: false,
      message: error.message || 'Internal server error',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Proctor mock backend running at http://${HOST}:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/auth/room-code');
  console.log('  POST /api/sessions/start');
  console.log('  POST /api/sessions/end');
  console.log('  POST /api/sessions/heartbeat');
  console.log('  POST /api/violations/report');
  console.log('  POST /api/violations/batch');
  console.log('  POST /api/violations');
  console.log('  POST /api/session/disconnect');
  console.log('  POST /api/offline-logs');
  console.log('  GET  /api/sessions/:sessionId');
});

process.on('SIGINT', () => {
  console.log('\nShutting down mock backend...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('\nShutting down mock backend...');
  server.close(() => process.exit(0));
});
