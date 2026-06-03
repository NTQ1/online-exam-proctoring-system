import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Op } from 'sequelize'
import busboy from 'busboy'
import ExamRoom from '../models/ExamRoom.js'
import ExamParticipant from '../models/ExamParticipant.js'
import MonitoringSession from '../models/MonitoringSession.js'
import ViolationEvent from '../models/ViolationEvent.js'
import BlockchainRecord from '../models/BlockchainRecord.js'
import { pushToBlockchain, verifySession } from '../services/blockchainService.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Thư mục gốc của public (backend/public/)
const PUBLIC_DIR = path.join(__dirname, '../../public')

function jsonResponse(res, statusCode, payload) {
  return res.status(statusCode).json(payload)
}

function normalizeSessionId(sessionId) {
  if (!sessionId) return sessionId
  return String(sessionId).startsWith('session_') ? String(sessionId).replace(/^session_/, '') : sessionId
}

/**
 * Lưu ảnh base64 vào public/, trả về URL công khai.
 * @param {string} base64String   - data URL hoặc bare base64
 * @param {'screenshots'|'ai-violations'} subDir
 * @returns {string|null}         - URL dạng /screenshots/<file> hoặc /ai-violations/<file>
 */
function saveBase64Image(base64String, subDir = 'ai-violations') {
  if (!base64String) return null
  try {
    let matches = base64String.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/)
    let extension
    let imageBuffer

    if (matches && matches.length === 3) {
      extension = matches[1] === 'jpeg' ? 'jpg' : matches[1]
      imageBuffer = Buffer.from(matches[2], 'base64')
    } else {
      const bare = base64String.replace(/^\s+|\s+$/g, '')
      if (/^[A-Za-z0-9+/=\s]+$/.test(bare)) {
        extension = 'jpg'
        imageBuffer = Buffer.from(bare, 'base64')
      } else {
        return null
      }
    }

    const fileName = `${Date.now()}_${randomUUID()}.${extension}`

    let uploadsDir
    let publicUrl

    if (subDir === 'screenshots') {
      // public/screenshots/<file> → served as /screenshots/<file>
      uploadsDir = path.join(PUBLIC_DIR, 'screenshots')
      publicUrl = `/screenshots/${fileName}`
    } else {
      // public/ai-violations/<file> → served as /ai-violations/<file>
      uploadsDir = path.join(PUBLIC_DIR, subDir)
      publicUrl = `/ai-violations/${fileName}`
    }

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const filePath = path.join(uploadsDir, fileName)
    fs.writeFileSync(filePath, imageBuffer)
    console.log(`[Image] Saved ${subDir}: ${filePath} → ${publicUrl}`)
    return publicUrl
  } catch (error) {
    console.error('[Image] Error saving image:', error)
    return null
  }
}

/**
 * Parse multipart/form-data với busboy.
 * Nhận field 'sessionId' và file 'screenshot'.
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers })
    let sessionId = null
    let imageBuffer = null
    let mimeType = 'image/jpeg'

    bb.on('field', (name, val) => {
      if (name === 'sessionId') sessionId = val
    })

    bb.on('file', (name, file, info) => {
      if (name === 'screenshot') {
        mimeType = info.mimeType || 'image/jpeg'
        const chunks = []
        file.on('data', (chunk) => chunks.push(chunk))
        file.on('end', () => {
          imageBuffer = Buffer.concat(chunks)
        })
      } else {
        // Drain unused files
        file.resume()
      }
    })

    bb.on('close', () => {
      if (!sessionId) return reject(new Error('sessionId missing'))
      if (!imageBuffer) return reject(new Error('screenshot file missing'))
      resolve({ sessionId, imageBuffer, mimeType })
    })

    bb.on('error', reject)
    req.pipe(bb)
  })
}

// ─── Auth ────────────────────────────────────────────────────────────────────

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
        status: 'online',
        joined_at: new Date(),
      })
    } else {
      participant.student_name = studentName
      participant.status = 'online'
      await participant.save()
    }

    // Create monitoring session with 'authenticated' status
    const session = await MonitoringSession.create({
      participant_id: participant.id,
      status: 'authenticated',
    })

    const token = randomUUID()

    return jsonResponse(res, 200, {
      ok: true,
      token,
      sessionId: `session_${session.id}`,
      serverUrl: `http://${req.headers.host}`,
      message: 'Authentication accepted',
    })
  } catch (error) {
    console.error('[Auth] Error:', error)
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

export const handleStartSession = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
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

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
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
    const { sessionId, endedAt, endReason, screenshotDataUrl, screenshotUrl, triggerBlockchain, summary, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    let finalScreenshotUrl = screenshotUrl || null
    if (!finalScreenshotUrl && screenshotDataUrl) {
      finalScreenshotUrl = saveBase64Image(screenshotDataUrl, 'screenshots')
    }

    session.status = 'finalized'
    session.end_time = endedAt ? new Date(endedAt) : (timestamp ? new Date(timestamp) : new Date())
    session.end_reason = endReason || null
    session.screenshot_url = finalScreenshotUrl
    session.trigger_blockchain = triggerBlockchain || false
    await session.save()

    // ── Verdict logic ──
    const allViolations = await ViolationEvent.findAll({
      where: { session_id: id },
      order: [['timestamp', 'ASC']],
    })

    if (allViolations.length === 0) {
      session.verdict = 'clean'
    } else {
      session.verdict = 'violated'
    }
    await session.save()

    // ── Blockchain logic ──
    const highViolations = allViolations.filter(
      v => v.severity === 'high' || v.type === 'ai_violation'
    )

    // ── Clean session: vẫn đẩy lên chain để đối chiếu sau này ──
    if (allViolations.length === 0) {
      let cleanBlockchainResult = null
      if (triggerBlockchain) {
        try {
          // Tạo một "violation" giả mang thông tin thời điểm kết thúc
          const cleanRecord = [{
            type: 'CLEAN_SESSION',
            severity: 'info',
            timestamp: new Date(),
            details: { message: 'No violations detected — session ended cleanly' },
          }]
          cleanBlockchainResult = await pushToBlockchain(id, cleanRecord)
        } catch (err) {
          console.error('[Finalize] Blockchain push (clean) error:', err.message)
          cleanBlockchainResult = { status: 'failed', error: err.message }
        }
      }
      return jsonResponse(res, 200, {
        ok: true, sessionId,
        message: 'Session finalized',
        verdict: 'clean',
        blockchain: cleanBlockchainResult,
      })
    }

    let blockchainResult = null
    if (triggerBlockchain && highViolations.length > 0) {
      try {
        blockchainResult = await pushToBlockchain(id, highViolations)
      } catch (err) {
        console.error('[Finalize] Blockchain push error:', err.message)
        blockchainResult = { status: 'failed', error: err.message }
      }
    }

    return jsonResponse(res, 200, {
      ok: true, sessionId,
      message: 'Session finalized',
      verdict: 'violated',
      violations_count: allViolations.length,
      blockchain: blockchainResult,
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

// ─── Screenshot upload (multipart/form-data) ─────────────────────────────────

export const handleUploadScreenshot = async (req, res) => {
  try {
    const { sessionId, imageBuffer, mimeType } = await parseMultipart(req)

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) {
      return jsonResponse(res, 404, { ok: false, message: 'Session not found' })
    }

    // Lưu vào public/screenshots/
    const ext = mimeType.includes('png') ? 'png' : 'jpg'
    const fileName = `${Date.now()}_${randomUUID()}.${ext}`
    const uploadsDir = path.join(PUBLIC_DIR, 'screenshots')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

    const filePath = path.join(uploadsDir, fileName)
    fs.writeFileSync(filePath, imageBuffer)

    const protocol = req.protocol || 'http'
    const host = req.headers.host || 'localhost:5001'
    const screenshotUrl = `${protocol}://${host}/screenshots/${fileName}`

    // Cập nhật session
    session.screenshot_url = `/screenshots/${fileName}`
    await session.save()

    console.log(`[Screenshot] Saved: ${filePath} → ${screenshotUrl}`)
    return jsonResponse(res, 200, { ok: true, screenshotUrl })
  } catch (err) {
    console.error('[Screenshot] Upload error:', err.message)
    return jsonResponse(res, 400, { ok: false, message: err.message })
  }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export const handleHeartbeat = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const heartbeats = session.heartbeats || []
    heartbeats.push(timestamp || Date.now())
    session.heartbeats = heartbeats
    session.changed('heartbeats', true)
    await session.save()

    return jsonResponse(res, 200, { ok: true, sessionId, count: heartbeats.length })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

// ─── Violations ───────────────────────────────────────────────────────────────

export const handleViolationReport = async (req, res) => {
  try {
    const { sessionId, violationType, timestamp, details } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const violation = await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: id,
      type: violationType,
      severity: req.body.severity || null,
      details: details || {},
      timestamp: timestamp ? new Date(timestamp) : new Date(),
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

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    if (Array.isArray(violations)) {
      const records = violations.map(v => ({
        participant_id: session.participant_id,
        session_id: id,
        type: v.violationType || v.type || 'UNKNOWN',
        severity: v.severity || null,
        details: v.details || {},
        timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
      }))
      await ViolationEvent.bulkCreate(records)
    }

    return jsonResponse(res, 200, { ok: true, sessionId, inserted: violations?.length || 0 })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

/**
 * POST /api/violations
 * Log một vi phạm với format { sessionId, type, feature, severity, timestamp, details }
 */
export const handleLogViolation = async (req, res) => {
  try {
    const { sessionId, type, feature, timestamp, severity, details } = req.body
    if (!sessionId || !type) return jsonResponse(res, 400, { ok: false, message: 'sessionId and type are required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const violation = await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: id,
      type,
      severity: severity || 'warning',
      details: { feature, ...(details || {}) },
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    })

    return jsonResponse(res, 200, { ok: true, sessionId, violationId: violation.id, count: 1 })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

/**
 * POST /api/ai-violations
 * Nhận { sessionId, detections, imageDataUrl, timestamp }
 * Lưu ảnh vào public/ai-violations/, ghi ViolationEvent type='ai_violation'
 */
export const handleAIViolation = async (req, res) => {
  try {
    const { sessionId, detections, imageDataUrl, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    // Lưu ảnh vào public/ai-violations/
    const imageUrl = saveBase64Image(imageDataUrl, 'ai-violations')

    const violation = await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: id,
      type: 'ai_violation',
      severity: 'high',
      details: { detections: detections || [] },
      image_url: imageUrl,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    })

    const classes = (detections || []).map(d => `${d.className}(${(d.confidence * 100).toFixed(1)}%)`).join(', ')
    console.log(`[AI-Violation] session=${id.slice(0, 8)}... classes=${classes} image=${imageUrl || 'none'}`)

    return jsonResponse(res, 200, {
      ok: true,
      sessionId,
      violationId: violation.id,
      count: 1,
      hasImage: !!imageUrl,
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

// ─── Disconnect & Offline Logs ────────────────────────────────────────────────

export const handleDisconnect = async (req, res) => {
  try {
    const { sessionId, reason, timestamp } = req.body
    if (!sessionId) return jsonResponse(res, 400, { ok: false, message: 'sessionId required' })

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    await ViolationEvent.create({
      participant_id: session.participant_id,
      session_id: id,
      type: 'disconnect',
      severity: 'warning',
      details: { reason },
      timestamp: timestamp ? new Date(timestamp) : new Date(),
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

    const id = normalizeSessionId(sessionId)
    const session = await MonitoringSession.findByPk(id)
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
            session_id: id,
            type: log.violationType || log.type || 'offline_violation',
            severity: log.severity || 'warning',
            details: log.details || {},
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
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

// ─── Get Session ──────────────────────────────────────────────────────────────

export const handleGetSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const id = normalizeSessionId(sessionId)

    const session = await MonitoringSession.findByPk(id, {
      include: [
        { association: 'participant' },
        { association: 'violations', order: [['timestamp', 'ASC']] },
      ],
    })

    if (!session) return jsonResponse(res, 404, { ok: false, message: 'Session not found' })

    const data = session.toJSON()
    return jsonResponse(res, 200, {
      ok: true,
      snapshot: {
        ...data,
        aiViolations: (data.violations || []).filter(v => v.type === 'ai_violation'),
        aiViolationCount: (data.violations || []).filter(v => v.type === 'ai_violation').length,
      },
    })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

// ─── Blockchain Record ────────────────────────────────────────────────────────

export const handleGetBlockchainRecord = async (req, res) => {
  try {
    const { sessionId } = req.params
    const id = normalizeSessionId(sessionId)

    const record = await BlockchainRecord.findOne({
      where: { session_id: id },
      order: [['createdAt', 'DESC']],
    })

    if (!record) {
      return jsonResponse(res, 404, { ok: false, message: 'No blockchain record found for this session' })
    }

    let verification = { match: false, reason: 'Verification skipped' }
    if (record.status === 'confirmed' && record.tx_hash) {
      try {
        verification = await verifySession(id)
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
