import express from 'express'
import { createExamRoom, updateExamRoom, deleteExamRoom, startExamRoom, endExamRoom } from '../controllers/examRoomCRUD.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { getStats, getExamRooms } from '../controllers/examRoomQuery.js'


const router = express.Router()

router.post('/', authenticate, authorize('admin'), createExamRoom)
router.put('/:id', authenticate, authorize('admin'), updateExamRoom)
router.delete('/:id', authenticate, authorize('admin'), deleteExamRoom)
router.patch('/:id/start', authenticate, authorize('admin'), startExamRoom)
router.patch('/:id/end', authenticate, authorize('admin'), endExamRoom)
router.get('/stats', authenticate, authorize('admin'), getStats)
router.get('/', authenticate, authorize('admin'), getExamRooms)
export default router