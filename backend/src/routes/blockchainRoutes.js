import express from 'express'
import { getBlockchainRecords, getBlockchainStats } from '../controllers/blockchainController.js'

const router = express.Router()

router.get('/', getBlockchainRecords)
router.get('/stats', getBlockchainStats)

export default router