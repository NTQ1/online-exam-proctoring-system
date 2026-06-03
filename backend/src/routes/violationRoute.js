import express from 'express'
import {
  getRecentViolations,
  getViolationStatistics
} from '../controllers/violationController.js'

const router = express.Router()

router.get('/recent', getRecentViolations)
router.get('/statistics', getViolationStatistics)

export default router