import express from 'express'
import { joinExamRoom, getParticipants } from '../controllers/examParticipantController.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'

const router = express.Router()

// Sinh viên join phòng thi
router.post('/join', authenticate, authorize('student'), joinExamRoom)

// Giảng viên xem danh sách sinh viên
router.get('/:id/participants', authenticate, authorize('admin'), getParticipants)

export default router