import ExamParticipant from '../models/ExamParticipant.js'
import ExamRoom from '../models/ExamRoom.js'
import crypto from 'crypto'

// Sinh viên join phòng thi (không cần đăng nhập)
export const joinExamRoom = async (req, res) => {
  try {
    const { code, password, student_name, student_id } = req.body

    if (!student_name || !student_id) {
      return res.status(400).json({ message: 'Vui lòng nhập họ tên và MSSV' })
    }

    // Tìm phòng thi theo mã
    const room = await ExamRoom.findOne({ where: { code } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }

    // Chỉ cho join khi pending
    if (room.status !== 'pending') {
      return res.status(400).json({ message: 'Phòng thi đã bắt đầu hoặc kết thúc, không thể tham gia' })
    }

    // Kiểm tra mật khẩu
    if (room.password && room.password !== password) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' })
    }

    // Kiểm tra sinh viên đã join chưa (theo MSSV + room_id)
    const existed = await ExamParticipant.findOne({
      where: { room_id: room.id, student_id_string: student_id }
    })
    if (existed) {
      return res.status(400).json({ message: 'MSSV này đã tham gia phòng thi rồi' })
    }

   // Tạo record tham gia
    const participant = await ExamParticipant.create({
      room_id: room.id,
      student_name,
      student_id_string: student_id,
      status: 'online',
      joined_at: new Date(),
    })

    // Token dùng để extension xác thực các request tiếp theo
    const token = crypto.randomUUID()

    return res.status(201).json({
      message: 'Tham gia phòng thi thành công',
      token,
      participantId: participant.id,
      serverUrl: process.env.SERVER_URL,
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
      order: [['joined_at', 'ASC']]
    })

    return res.status(200).json({ participants })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách sinh viên', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}