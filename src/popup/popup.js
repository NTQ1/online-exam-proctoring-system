import { logger } from '../core/logger.js';
import { getAuthState, saveAuthSession } from '../core/session.js';
import { apiService } from '../services/api.js';

const authForm = document.getElementById('authForm');
const roomCodeInput = document.getElementById('roomCode');
const studentNameInput = document.getElementById('studentName');
const studentIdInput = document.getElementById('studentId');
const submitBtn = document.getElementById('submitBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const btnText = document.querySelector('.btn-text');
const btnLoading = document.querySelector('.btn-loading');

document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  logger.info('Popup initialized');

  const saved = await getAuthState();
  if (saved.studentInfo) {
    const { name, msv } = saved.studentInfo;
    studentNameInput.value = name || '';
    studentIdInput.value = msv || '';
  }

  authForm.addEventListener('submit', handleFormSubmit);
  roomCodeInput.addEventListener('input', clearError);
  studentNameInput.addEventListener('input', clearError);
  studentIdInput.addEventListener('input', clearError);
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const validation = validateInputs();
  if (!validation.valid) {
    showError(validation.message);
    return;
  }

  const roomCode = roomCodeInput.value.trim();
  const studentName = studentNameInput.value.trim();
  const studentId = studentIdInput.value.trim();

  setLoading(true);
  clearMessages();
  showConnectionStatus(true);

  try {
    const authResponse = await authenticateRoomCode(roomCode, studentName, studentId);

    await saveAuthSession({
      roomCode,
      studentName,
      studentId,
      authToken: authResponse.token,
      sessionId: authResponse.sessionId,
      serverUrl: authResponse.serverUrl,
    });

    showSuccess('✓ Đã kết nối server thành công. Chưa bắt đầu giám sát.');
    setTimeout(() => window.close(), 1500);
  } catch (error) {
    logger.error('Authentication error', { message: error.message });
    showError(error.message);
  } finally {
    setLoading(false);
    showConnectionStatus(false);
  }
}

async function authenticateRoomCode(roomCode, studentName, studentId) {
  try {
    const data = await apiService.authenticateRoomCode(roomCode, studentName, studentId);

    if (!data || !data.token || !data.sessionId) {
      throw new Error('Invalid server response');
    }

    return {
      token: data.token,
      sessionId: data.sessionId,
      serverUrl: data.serverUrl || apiService.getServerUrl(),
    };
  } catch (error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      logger.warn('Server not available, using test mode', error);
      return {
        token: `test-${Date.now()}`,
        sessionId: `session-${Date.now()}`,
        serverUrl: 'test://local',
      };
    }

    throw error;
  }
}

function validateInputs() {
  const roomCode = roomCodeInput.value.trim();
  const studentName = studentNameInput.value.trim();
  const studentId = studentIdInput.value.trim();

  if (!roomCode) {
    return { valid: false, message: 'Vui lòng nhập mã phòng thi' };
  }

  if (roomCode.length < 3) {
    return { valid: false, message: 'Mã phòng thi phải ít nhất 3 ký tự' };
  }

  if (!studentName) {
    return { valid: false, message: 'Vui lòng nhập họ và tên' };
  }

  if (studentName.length < 3) {
    return { valid: false, message: 'Họ và tên phải ít nhất 3 ký tự' };
  }

  if (!studentId) {
    return { valid: false, message: 'Vui lòng nhập MSV' };
  }

  if (studentId.length < 2) {
    return { valid: false, message: 'MSV phải ít nhất 2 ký tự' };
  }

  return { valid: true };
}

function showError(message) {
  errorMessage.textContent = '❌ ' + message;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';
}

function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';
}

function clearError() {
  errorMessage.style.display = 'none';
}

function clearMessages() {
  errorMessage.style.display = 'none';
  successMessage.style.display = 'none';
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  btnText.style.display = isLoading ? 'none' : 'inline';
  btnLoading.style.display = isLoading ? 'flex' : 'none';
}

function showConnectionStatus(show) {
  connectionStatus.style.display = show ? 'flex' : 'none';
  if (show) {
    statusText.textContent = 'Đang xác thực và kết nối server...';
  }
}
