import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Op } from 'sequelize'
import ExamRoom from '../models/ExamRoom.js'
import ExamParticipant from '../models/ExamParticipant.js'
import MonitoringSession from '../models/MonitoringSession.js'
import ViolationEvent from '../models/ViolationEvent.js'
import BlockchainRecord from '../models/BlockchainRecord.js'
import { pushToBlockchain, verifySession } from '../services/blockchainService.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function jsonResponse(res, statusCode, payload) {
  return res.status(statusCode).json(payload)
}

function saveBase64Image(base64String, subDir = 'ai-violations') {
  if (!base64String) return null
  try {
    const matches = base64String.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      return null
    }
    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1]
    const imageBuffer = Buffer.from(matches[2], 'base64')
    const fileName = `${Date.now()}_${randomUUID()}.${extension}`
    const uploadsDir = path.join(__dirname, `../../public/uploads/${subDir}`)
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }
    
    const filePath = path.join(uploadsDir, fileName)
    fs.writeFileSync(filePath, imageBuffer)
    
    return `/uploads/${subDir}/${fileName}`
  } catch (error) {
    console.error('Error saving image:', error)
    return null
  }
}

export const handleAuthRoomCode = async (req, res) => {
  try {
    const { roomCode, studentName, studentId } = req.body

    if (!roomCode || !studentName || !studentId) {
      return jsonResponse(res, 400, { ok: false, message: 'roomCode, studentName, studentId are required' })
    }

    const room = await ExamRoom.findOne({ where: { code: roomCode } })
    if (!room) {
      return jsonResponse(res, 404, { ok: false, message: 'Phòng thi không tồn tại' })
    }

    // Find or create participant
    let participant = await ExamParticipant.findOne({
      where: { room_id: room.id, student_id_string: studentId }
    })

    if (!participant) {
      participant = await ExamParticipant.create({
        room_id: room.id,
        student_name: studentName,
        student_id_string: studentId,
        status: 'online'
      })
    } else {
      participant.student_name = studentName
      await participant.save()
    }

    // Create session
    const session = await MonitoringSession.create({
      participant_id: participant.id,
      status: 'active'
    })

    const token = randomUUID()

    return jsonResponse(res, 200, {
      ok: true,
      token,
      sessionId: session.id,
      serverUrl: `http://${req.headers.host}`,
      message: 'Authentication accepted'
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleStartSession = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    session.status = 'active'
    session.start_time = timestamp ? new Date(timestamp) : new Date()
    await session.save()

    return jsonResponse(res, 200, { ok: true, sessionId, message: 'Session started' })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleEndSession = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    session.status = 'ended'
    session.end_time = timestamp ? new Date(timestamp) : new Date()
    await session.save()

    return jsonResponse(res, 200, { ok: true, sessionId, message: 'Session ended' })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleFinalizeSession = async (req, res) => {
  try {
    const { sessionId, endedAt, endReason, screenshotDataUrl, triggerBlockchain, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const imagePath = saveBase64Image(screenshotDataUrl, 'screenshots')

    session.status = 'finalized'
    session.end_time = endedAt ? new Date(endedAt) : (timestamp ? new Date(timestamp) : new Date())
    session.end_reason = endReason
    session.screenshot_url = imagePath
    session.trigger_blockchain = triggerBlockchain || false
    await session.save()

    // ── Blockchain logic ──
    // Query high-severity violations (LOG_VIOLATION with severity='high' OR ai_violation type)
    const highViolations = await ViolationEvent.findAll({
      where: {
        session_id: sessionId,
        [Op.or]: [
          { severity: 'high' },
          { type: 'ai_violation' },
        ],
      },
      order: [['timestamp', 'ASC']],
    })

    if (highViolations.length === 0) {
      // Không có vi phạm nghiêm trọng → verdict: clean
      session.verdict = 'clean'
      await session.save()
      return jsonResponse(res, 200, {
        ok: true, sessionId,
        message: 'Session finalized',
        verdict: 'clean',
        blockchain: null,
      })
    }

    // Có vi phạm nghiêm trọng → push blockchain
    session.verdict = 'violated'
    await session.save()

    let blockchainResult = null
    if (triggerBlockchain) {
      try {
        blockchainResult = await pushToBlockchain(sessionId, highViolations)
      } catch (err) {
        console.error('[Finalize] Blockchain push error:', err.message)
        blockchainResult = { status: 'failed', error: err.message }
      }
    }

    return jsonResponse(res, 200, {
      ok: true, sessionId,
      message: 'Session finalized',
      verdict: 'violated',
      violations_count: highViolations.length,
      blockchain: blockchainResult,
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleHeartbeat = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const heartbeats = session.heartbeats || []
    heartbeats.push(timestamp || Date.now())
    
    // Sequelize JSON arrays need to be re-assigned or use changed()
    session.heartbeats = heartbeats
    session.changed('heartbeats', true)
    await session.save()

    return jsonResponse(res, 200, { ok: true, sessionId, count: heartbeats.length })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleViolationReport = async (req, res) => {
  try {
    const { sessionId, violationType, timestamp, details } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const violation = await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: sessionId,
      type: violationType,
      severity: req.body.severity || null,
      details: details || {},
      timestamp: timestamp ? new Date(timestamp) : new Date()
    })

    return jsonResponse(res, 200, { ok: true, sessionId, violationId: violation.id })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleViolationBatch = async (req, res) => {
  try {
    const { sessionId, violations } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    if (Array.isArray(violations)) {
      const records = violations.map(v => ({
        participant_id: session.participant_id,
        session_id: sessionId,
        type: v.violationType || v.type || 'UNKNOWN',
        details: v.details || {},
        timestamp: v.timestamp ? new Date(v.timestamp) : new Date()
      }))
      await ViolationEvent.bulkCreate(records)
    }

    return jsonResponse(res, 200, { ok: true, sessionId, inserted: violations?.length || 0 })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleAIViolation = async (req, res) => {
  try {
    const { sessionId, detections, imageDataUrl, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const imagePath = saveBase64Image(imageDataUrl)

    const violation = await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: sessionId,
      type: 'ai_violation',
      details: { detections },
      image_path: imagePath,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    })

    return jsonResponse(res, 200, { ok: true, sessionId, violationId: violation.id })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleDisconnect = async (req, res) => {
  try {
    const { sessionId, reason, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: sessionId,
      type: 'disconnect',
      details: { reason },
      timestamp: timestamp ? new Date(timestamp) : new Date()
    })

    return jsonResponse(res, 200, { ok: true, sessionId })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleOfflineLogs = async (req, res) => {
  try {
    const { sessionId, logs } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const session = await MonitoringSession.findByPk(sessionId)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    if (Array.isArray(logs)) {
      const heartbeats = session.heartbeats || []
      const violations = []

      for (const log of logs) {
        if (log.type === 'HEARTBEAT') {
          heartbeats.push(log.timestamp || Date.now())
        } else {
          violations.push({
            participant_id: session.participant_id,
            session_id: sessionId,
            type: log.violationType || log.type || 'offline_violation',
            details: log.details || {},
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
          })
        }
      }

      if (violations.length > 0) {
        await ViolationEvent.bulkCreate(violations)
      }

      session.heartbeats = heartbeats
      session.changed('heartbeats', true)
      await session.save()
    }

    return jsonResponse(res, 200, { ok: true, sessionId })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

export const handleGetSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = await MonitoringSession.findByPk(sessionId, {
      include: ['participant', 'violations']
    })
    
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    return jsonResponse(res, 200, { ok: true, snapshot: session })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

/**
 * GET /api/sessions/:sessionId/blockchain
 * Trả về blockchain record + verify tính toàn vẹn dữ liệu.
 */
export const handleGetBlockchainRecord = async (req, res) => {
  try {
    const { sessionId } = req.params

    const record = await BlockchainRecord.findOne({
      where: { session_id: sessionId },
      order: [['createdAt', 'DESC']],
    })

    if (!record) {
      return jsonResponse(res, 404, { ok: false, message: 'No blockchain record found for this session' })
    }

    // Verify on-chain integrity
    let verification = { match: false, reason: 'Verification skipped' }
    if (record.status === 'confirmed' && record.tx_hash) {
      try {
        verification = await verifySession(sessionId)
      } catch (err) {
        verification = { match: false, reason: `Verification failed: ${err.message}` }
      }
    }

    const explorerUrl = record.tx_hash
      ? `https://sepolia.etherscan.io/tx/${record.tx_hash}`
      : null

    return jsonResponse(res, 200, {
      ok: true,
      tx_hash: record.tx_hash,
      explorer_url: explorerUrl,
      block_number: record.block_number,
      data_hash: record.data_hash,
      status: record.status,
      retry_count: record.retry_count,
      confirmed_at: record.confirmed_at,
      verified: verification.match,
      data_hash_match: verification.match,
      on_chain_hash: verification.on_chain_hash || null,
      recomputed_hash: verification.recomputed_hash || null,
      verification_reason: verification.reason || null,
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}
