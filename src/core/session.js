import { storage } from './storage.js';

const AUTH_KEYS = [
  'authToken',
  'sessionId',
  'serverUrl',
  'studentInfo',
  'roomCode',
  'startTime',
  'proctorSession',
];

export async function getAuthState() {
  return storage.get(AUTH_KEYS);
}

export async function saveStudentInfo(studentInfo) {
  return storage.set({
    studentInfo: {
      name: studentInfo.name || '',
      msv: studentInfo.msv || '',
    },
  });
}

export async function saveAuthSession({ roomCode, studentName, studentId, authToken, sessionId, serverUrl }) {
  return storage.set({
    authToken,
    sessionId,
    serverUrl,
    studentInfo: {
      name: studentName,
      msv: studentId,
    },
    roomCode,
    startTime: Date.now(),
  });
}

export async function saveProctorSession(proctorSession) {
  return storage.set({
    proctorSession: {
      ...proctorSession,
    },
  });
}

export async function clearAuthSession() {
  return storage.remove([
    'authToken',
    'sessionId',
    'serverUrl',
    'studentInfo',
    'roomCode',
    'startTime',
    'proctorSession',
  ]);
}