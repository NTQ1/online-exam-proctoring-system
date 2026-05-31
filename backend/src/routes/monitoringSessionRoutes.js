import express from 'express'

import {
  startSession,
  finalizeSession,
  heartbeatSession,
} from '../controllers/monitoringSessionController.js'

const router = express.Router()

router.post('/start', startSession)

router.post('/finalize', finalizeSession)

router.post('/heartbeat', heartbeatSession)

export default router