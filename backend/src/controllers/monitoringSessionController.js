import MonitoringSession from '../models/MonitoringSession.js'
import ExamParticipant from '../models/ExamParticipant.js'

export const startSession = async (req, res) => {
  try {
    const { participantId } = req.body

    if (!participantId) {
      return res.status(400).json({ message: 'participantId là bắt buộc' })
    }

    // Xác nhập participant tồn tại
    const participant = await ExamParticipant.findByPk(participantId)
    if (!participant) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên' })
    }

    const session = await MonitoringSession.create({
      participant_id: participantId,
      status: 'active',
      start_time: new Date(),
      verdict: 'pending',
    })

    return res.status(201).json({
      message: 'Session started',
      sessionId: session.id,
      session,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Lỗi tạo session',
      error: error.message,
    })
  }
}

export const finalizeSession = async (req, res) => {
  try {
    const {
      sessionId,
      endReason,
      screenshotDataUrl,
    } = req.body

    const session = await MonitoringSession.findByPk(sessionId)

    if (!session) {
      return res.status(404).json({
        message: 'Session không tồn tại',
      })
    }

    session.status = 'finalized'
    session.end_time = new Date()
    session.end_reason = endReason
    session.screenshot_url = screenshotDataUrl
    session.trigger_blockchain = true

    await session.save()

    return res.status(200).json({
      message: 'Finalize session thành công',
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: 'Lỗi finalize session',
      error: error.message,
    })
  }
}

export const heartbeatSession = async (req, res) => {
  try {
    const { sessionId, timestamp } = req.body

    const session = await MonitoringSession.findByPk(sessionId)

    if (!session) {
      return res.status(404).json({
        message: 'Session không tồn tại',
      })
    }

    const heartbeats = session.heartbeats || []

    heartbeats.push({
      timestamp,
    })

    session.heartbeats = heartbeats

    await session.save()

    return res.status(200).json({
      ok: true,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: 'Heartbeat lỗi',
      error: error.message,
    })
  }
}