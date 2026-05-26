import ExamRoom from '../models/ExamRoom.js'
import ExamParticipant from '../models/ExamParticipant.js'

export const getStats = async (req, res) => {
  try {
    const teacher_id = req.user.userId

    const totalRooms = await ExamRoom.count({ where: { teacher_id } })
    const endedRooms = await ExamRoom.count({ where: { teacher_id, status: 'ended' } })

    const rooms = await ExamRoom.findAll({ 
      where: { teacher_id },
      attributes: ['id']
    })
    const roomIds = rooms.map(r => r.id)
    
    const totalParticipants = await ExamParticipant.count({ 
      where: { room_id: roomIds } 
    })

    return res.status(200).json({
      totalRooms,
      endedRooms,
      totalParticipants,
      totalWarnings: 0
    })
  } catch (error) {
    console.error('Lỗi khi lấy thống kê', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}

export const getExamRooms = async (req, res) => {
  try {
    const teacher_id = req.user.userId

    const rooms = await ExamRoom.findAll({
      where: { teacher_id },
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json({ rooms })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}