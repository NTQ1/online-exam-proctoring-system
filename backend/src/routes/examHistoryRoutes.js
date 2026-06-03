import express from 'express'
import { getExamHistory, getStudentHistory } from '../controllers/examHistoryController.js'

const router = express.Router()

router.get('/', getExamHistory)
router.get('/student/:studentId', getStudentHistory)

export default router