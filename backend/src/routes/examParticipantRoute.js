import express from 'express'
import { joinExamRoom, getParticipants } from '../controllers/examParticipantController.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'

const router = express.Router()

// Sinh viên join — không cần đăng nhập
router.post('/join', joinExamRoom)

// Route cho extension authenticate
router.post('/proctor/authenticate', joinExamRoom)

// Giảng viên xem danh sách
router.get('/:id/participants', authenticate, authorize('admin'), getParticipants)

export default router