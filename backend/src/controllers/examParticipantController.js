import ExamParticipant from '../models/ExamParticipant.js'
import ExamRoom from '../models/ExamRoom.js'
import User from '../models/User.js'

// Sinh viên join phòng thi
export const joinExamRoom = async (req, res) => {
  try {
    const { code, password } = req.body
    const user_id = req.user.userId

    // Tìm phòng thi theo mã
    const room = await ExamRoom.findOne({ where: { code } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }

    // ✅ Chỉ cho join khi pending
        if (room.status !== 'pending') {
        return res.status(400).json({ message: 'Phòng thi đã bắt đầu hoặc kết thúc, không thể tham gia' })
        }

    // Kiểm tra mật khẩu
    if (room.password && room.password !== password) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' })
    }

    // Kiểm tra sinh viên đã join chưa
    const existed = await ExamParticipant.findOne({
      where: { room_id: room.id, user_id }
    })
    if (existed) {
      return res.status(400).json({ message: 'Bạn đã tham gia phòng thi này rồi' })
    }

    // Tạo record tham gia
    const participant = await ExamParticipant.create({
      room_id: room.id,
      user_id,
      status: 'online',
      joined_at: new Date(),
    })

    return res.status(201).json({
      message: 'Tham gia phòng thi thành công',
      participant,
      room: {
        id: room.id,
        code: room.code,
        subject_name: room.subject_name,
        monitor_level: room.monitor_level,
      }
    })
  } catch (error) {
    console.error('Lỗi khi join phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}

// Lấy danh sách sinh viên trong phòng thi (dành cho giảng viên)
export const getParticipants = async (req, res) => {
  try {
    const { id } = req.params
    const teacher_id = req.user.userId

    // Kiểm tra phòng thi thuộc giảng viên này không
    const room = await ExamRoom.findOne({ where: { id, teacher_id } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }

    const participants = await ExamParticipant.findAll({
      where: { room_id: id },
      include: [{
        model: User,
        as: 'student',
        attributes: ['id', 'username', 'first_name', 'last_name', 'student_id', 'email']
      }],
      order: [['joined_at', 'ASC']]
    })

    return res.status(200).json({ participants })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách sinh viên', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}