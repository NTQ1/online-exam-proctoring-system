import { logger } from '../core/logger.js';
import { getAuthState } from '../core/session.js';
import { sendToBackground } from '../core/messaging.js';

let authForm;
let roomCodeInput;
let studentNameInput;
let studentIdInput;
let submitBtn;
let errorMessage;
let successMessage;
let connectionStatus;
let statusText;
let btnText;
let btnLoading;

function initDOMElements() {
  authForm = document.getElementById('authForm');
  roomCodeInput = document.getElementById('roomCode');
  studentNameInput = document.getElementById('studentName');
  studentIdInput = document.getElementById('studentId');
  submitBtn = document.getElementById('submitBtn');
  errorMessage = document.getElementById('errorMessage');
  successMessage = document.getElementById('successMessage');
  connectionStatus = document.getElementById('connectionStatus');
  statusText = document.getElementById('statusText');
  btnText = document.querySelector('.btn-text');
  btnLoading = document.querySelector('.btn-loading');
}

document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  initDOMElements();
  logger.info('Popup initialized');

  const saved = await getAuthState();
  if (saved.studentInfo) {
    const { name, msv } = saved.studentInfo;
    if (studentNameInput) studentNameInput.value = name || '';
    if (studentIdInput) studentIdInput.value = msv || '';
  }

  if (authForm) authForm.addEventListener('submit', handleFormSubmit);
  if (roomCodeInput) roomCodeInput.addEventListener('input', clearError);
  if (studentNameInput) studentNameInput.addEventListener('input', clearError);
  if (studentIdInput) studentIdInput.addEventListener('input', clearError);
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
    const response = await sendToBackground('START_PROCTORING', {
      roomCode,
      studentName,
      studentId,
    }, 20000);

    if (!response || response.ok !== true) {
      throw new Error(response?.error || 'Không thể bắt đầu giám sát');
    }

    showSuccess('✓ Đã xác thực và bắt đầu giám sát trên trang thi hiện tại.');
    setTimeout(() => window.close(), 900);
  } catch (error) {
    logger.error('Authentication error', { message: error.message });
    showError(error.message);
  } finally {
    setLoading(false);
    showConnectionStatus(false);
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
  if (errorMessage) {
    errorMessage.textContent = '❌ ' + message;
    errorMessage.style.display = 'block';
  }
  if (successMessage) successMessage.style.display = 'none';
}

function showSuccess(message) {
  if (successMessage) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
  }
  if (errorMessage) {
    errorMessage.style.display = 'none';
  }
}

function clearError() {
  if (errorMessage) {
    errorMessage.style.display = 'none';
  }
}

function clearMessages() {
  if (errorMessage) {
    errorMessage.style.display = 'none';
  }
  if (successMessage) {
    successMessage.style.display = 'none';
  }
}

function setLoading(isLoading) {
  if (submitBtn) submitBtn.disabled = isLoading;
  if (btnText) btnText.style.display = isLoading ? 'none' : 'inline';
  if (btnLoading) btnLoading.style.display = isLoading ? 'flex' : 'none';
}

function showConnectionStatus(show) {
  if (connectionStatus) {
    connectionStatus.style.display = show ? 'flex' : 'none';
    if (show && statusText) {
      statusText.textContent = 'Đang xác thực và kết nối server...';
    }
  }
}
