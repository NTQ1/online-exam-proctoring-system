import ViolationEvent from '../models/ViolationEvent.js'
import ExamParticipant from '../models/ExamParticipant.js'
import ExamRoom from '../models/ExamRoom.js'

export const getRecentViolations = async (req, res) => {
  try {
    const violations = await ViolationEvent.findAll({
      include: [
        {
          model: ExamParticipant,
          as: 'violationParticipant',
          attributes: ['student_name', 'student_id_string']
        }
      ],
      order: [['timestamp', 'DESC']],
      limit: 50
    })

    res.status(200).json({
      success: true,
      data: violations
    })
  } catch (error) {
    console.error('Get violations error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getViolationStatistics = async (req, res) => {
  try {
    const violations = await ViolationEvent.findAll({
      include: [
        {
          model: ExamParticipant,
          as: 'violationParticipant',
          attributes: ['id', 'student_name', 'room_id'],
          include: [
            {
              model: ExamRoom,
              as: 'room',
              attributes: ['id', 'code', 'subject_name'],
            }
          ]
        }
      ]
    })

    const roomStats = {}

    violations.forEach((violation) => {
      const participant = violation.violationParticipant
      if (!participant) {
        console.log('No participant for violation:', violation.id)
        return
      }

      const room = participant.room
      if (!room) {
        console.log('No room for participant:', participant.id)
        return
      }

      const key = room.id || room.code

      if (!roomStats[key]) {
        roomStats[key] = {
          room_code: room.code,
          subject_name: room.subject_name,
          total_violations: 0,
        }
      }

      roomStats[key].total_violations++
    })

    console.log('Room stats:', roomStats) // Debug

    const result = Object.values(roomStats).sort(
      (a, b) => b.total_violations - a.total_violations
    )

    console.log('Result count:', result.length) // Debug

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Get statistics error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}