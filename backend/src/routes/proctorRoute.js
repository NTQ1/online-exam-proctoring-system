import express from 'express'
import {
  handleAuthRoomCode,
  handleStartSession,
  handleEndSession,
  handleFinalizeSession,
  handleHeartbeat,
  handleViolationReport,
  handleViolationBatch,
  handleLogViolation,
  handleAIViolation,
  handleDisconnect,
  handleOfflineLogs,
  handleUploadScreenshot,
  handleGetSession,
  handleGetBlockchainRecord,
} from '../controllers/proctorController.js'

const router = express.Router()

// Authenticate via Room Code
router.post('/auth/room-code', handleAuthRoomCode)

// Session lifecycle
router.post('/sessions/start', handleStartSession)
router.post('/sessions/end', handleEndSession)
router.post('/sessions/finalize', handleFinalizeSession)
router.post('/sessions/heartbeat', handleHeartbeat)
router.post('/sessions/screenshot', handleUploadScreenshot)  // multipart/form-data

// Violations
router.post('/violations/report', handleViolationReport)
router.post('/violations/batch', handleViolationBatch)
router.post('/violations', handleLogViolation)   // LOG_VIOLATION từ extension
router.post('/ai-violations', handleAIViolation)

// Other
router.post('/session/disconnect', handleDisconnect)
router.post('/offline-logs', handleOfflineLogs)
router.get('/sessions/:sessionId', handleGetSession)
router.get('/sessions/:sessionId/blockchain', handleGetBlockchainRecord)

export default router
