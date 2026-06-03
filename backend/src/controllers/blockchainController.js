import BlockchainRecord from '../models/BlockchainRecord.js'
import MonitoringSession from '../models/MonitoringSession.js'
import ExamParticipant from '../models/ExamParticipant.js'
import ExamRoom from '../models/ExamRoom.js'

function jsonResponse(res, statusCode, payload) {
  return res.status(statusCode).json(payload)
}

/**
 * GET /api/blockchain
 * Lấy danh sách blockchain records
 */
//lấy danh sách blockchain records với phân trang và lọc theo trạng thái
export const getBlockchainRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query
    const pageSize = Math.min(parseInt(limit) || 20, 100)
    const pageNum = Math.max(parseInt(page) || 1, 1)
    const offset = (pageNum - 1) * pageSize

    const where = {}
    if (status && status !== 'all') where.status = status

    const { count, rows } = await BlockchainRecord.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
    })

    // Lấy thêm thông tin session
    const data = []
    for (const record of rows) {
      const session = await MonitoringSession.findByPk(record.session_id)
      let participant = null
      let room = null

      if (session) {
        participant = await ExamParticipant.findByPk(session.participant_id)
        if (participant) {
          room = await ExamRoom.findByPk(participant.room_id)
        }
      }

      data.push({
        id: record.id,
        sessionId: record.session_id,
        dataHash: record.data_hash,
        txHash: record.tx_hash,
        blockNumber: record.block_number,
        status: record.status,
        retryCount: record.retry_count,
        confirmedAt: record.confirmed_at,
        createdAt: record.createdAt,
        studentName: participant?.student_name || 'N/A',
        studentId: participant?.student_id_string || 'N/A',
        roomCode: room?.code || 'N/A',
        subjectName: room?.subject_name || 'N/A',
        verdict: session?.verdict || 'pending',
      })
    }

    return jsonResponse(res, 200, {
      ok: true,
      data,
      total: count,
      page: pageNum,
      limit: pageSize,
      totalPages: Math.ceil(count / pageSize),
    })
  } catch (error) {
    console.error('[Blockchain] Error:', error)
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}

/**
 * GET /api/blockchain/stats
 */
// Lấy thống kê số lượng record theo trạng thái
export const getBlockchainStats = async (req, res) => {
  try {
    const total = await BlockchainRecord.count()
    const confirmed = await BlockchainRecord.count({ where: { status: 'confirmed' } })
    const pending = await BlockchainRecord.count({ where: { status: 'pending' } })
    const failed = await BlockchainRecord.count({ where: { status: 'failed' } })

    return jsonResponse(res, 200, {
      ok: true,
      data: { total, confirmed, pending, failed }
    })
  } catch (error) {
    console.error('[Blockchain] Error:', error)
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}