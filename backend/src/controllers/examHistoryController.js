import MonitoringSession from '../models/MonitoringSession.js'
import ExamParticipant from '../models/ExamParticipant.js'
import ExamRoom from '../models/ExamRoom.js'
import ViolationEvent from '../models/ViolationEvent.js'
import { Op } from 'sequelize'

function jsonResponse(res, statusCode, payload) {
  return res.status(statusCode).json(payload)
}
// Lấy lịch sử thi với phân trang, tìm kiếm và lọc
export const getExamHistory = async (req, res) => {
  try {
    const { 
      search, roomId, verdict,
      page = 1, limit = 20 
    } = req.query

    const pageSize = Math.min(parseInt(limit) || 20, 100)
    const pageNum = Math.max(parseInt(page) || 1, 1)
    const offset = (pageNum - 1) * pageSize

    // Lấy tất cả sessions
    const where = {}
    if (verdict) where.verdict = verdict

    const { count, rows: sessions } = await MonitoringSession.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
    })

    // Lấy thông tin thủ công
    const data = []
    for (const s of sessions) {
      // Lấy participant
      const participant = await ExamParticipant.findByPk(s.participant_id)
      if (!participant) continue

      // Nếu có filter search mà ko khớp → bỏ qua
      if (search) {
        const nameMatch = participant.student_name?.toLowerCase().includes(search.toLowerCase())
        const idMatch = participant.student_id_string?.toLowerCase().includes(search.toLowerCase())
        if (!nameMatch && !idMatch) continue
      }

      // Lấy room
      const room = participant.room_id ? await ExamRoom.findByPk(participant.room_id) : null

      // Nếu có filter roomId mà ko khớp → bỏ qua
      if (roomId && room?.id !== Number(roomId)) continue

      // Lấy violations
      const violations = await ViolationEvent.findAll({
        where: { session_id: s.id },
        attributes: ['id', 'type', 'severity', 'timestamp'],
      })

      const violationTypes = [...new Set(violations.map(v => v.type))]

      data.push({
        id: s.id,
        roomCode: room?.code || 'N/A',
        subjectName: room?.subject_name || 'N/A',
        studentName: participant.student_name || 'N/A',
        studentId: participant.student_id_string || 'N/A',
        status: s.status,
        verdict: s.verdict || 'pending',
        startTime: s.start_time,
        endTime: s.end_time,
        duration: s.start_time && s.end_time 
          ? Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000) 
          : null,
        screenshotUrl: s.screenshot_url,
        totalViolations: violations.length,
        aiViolations: violations.filter(v => v.type === 'ai_violation').length,
        violationTypes,
      })
    }

    // Phân trang thủ công
    const total = data.length
    const pagedData = data.slice(offset, offset + pageSize)

    return jsonResponse(res, 200, {
      ok: true,
      data: pagedData,
      total,
      page: pageNum,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('[ExamHistory] Error:', error)
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}
// Lấy lịch sử thi của 1 sinh viên theo studentId
export const getStudentHistory = async (req, res) => {
  try {
    const { studentId } = req.params

    const participant = await ExamParticipant.findOne({
      where: { student_id_string: studentId },
    })

    if (!participant) {
      return jsonResponse(res, 404, { ok: false, message: 'Không tìm thấy sinh viên' })
    }

    const room = participant.room_id ? await ExamRoom.findByPk(participant.room_id) : null

    const sessions = await MonitoringSession.findAll({
      where: { participant_id: participant.id },
      order: [['createdAt', 'DESC']],
    })

    const data = []
    for (const s of sessions) {
      const violations = await ViolationEvent.findAll({
        where: { session_id: s.id },
      })

      data.push({
        id: s.id,
        roomCode: room?.code || 'N/A',
        subjectName: room?.subject_name || 'N/A',
        status: s.status,
        verdict: s.verdict || 'pending',
        startTime: s.start_time,
        endTime: s.end_time,
        screenshotUrl: s.screenshot_url,
        totalViolations: violations.length,
        violations,
      })
    }

    return jsonResponse(res, 200, {
      ok: true,
      data: {
        studentName: participant.student_name,
        studentId: participant.student_id_string,
        totalExams: data.length,
        sessions: data,
      }
    })
  } catch (error) {
    console.error('[ExamHistory] Error:', error)
    return jsonResponse(res, 500, { ok: false, message: error.message })
  }
}