import ExamRoom from '../models/ExamRoom.js'

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'EXAM-'
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let password = ''
  for (let i = 0; i < 4; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}

// Tạo phòng thi
export const createExamRoom = async (req, res) => {
  try {
    const { subject_name, monitor_level, password } = req.body  // ✅ thêm password
    const teacher_id = req.user.userId

    if (!subject_name) {
      return res.status(400).json({ message: 'Vui lòng nhập tên môn học' })
    }

    let code
    let exists = true
    while (exists) {
      code = generateRoomCode()
      exists = await ExamRoom.findOne({ where: { code } })
    }

    const room = await ExamRoom.create({
      code,
      password: password || null,  // ✅ null nếu không nhập
      subject_name,
      teacher_id,
      monitor_level: monitor_level || 'MEDIUM',
    })

    return res.status(201).json({ message: 'Tạo phòng thi thành công', room })
  } catch (error) {
    console.error('Lỗi khi tạo phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}
// Cập nhật phòng thi (chỉ khi pending)
export const updateExamRoom = async (req, res) => {
  try {
    const { id } = req.params
    const { subject_name, monitor_level, password } = req.body  // ✅ thêm password
    const teacher_id = req.user.userId

    const room = await ExamRoom.findOne({ where: { id, teacher_id } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }
    if (room.status !== 'pending') {
      return res.status(400).json({ message: 'Chỉ có thể sửa phòng thi chưa bắt đầu' })
    }

    await room.update({ subject_name, monitor_level, password })  // ✅ thêm password

    return res.status(200).json({ message: 'Cập nhật phòng thi thành công', room })
  } catch (error) {
    console.error('Lỗi khi cập nhật phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}

// Xóa phòng thi (chỉ khi pending)
export const deleteExamRoom = async (req, res) => {
  try {
    const { id } = req.params
    const teacher_id = req.user.userId

    const room = await ExamRoom.findOne({ where: { id, teacher_id } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }
    if (room.status !== 'pending') {
      return res.status(400).json({ message: 'Chỉ có thể xóa phòng thi chưa bắt đầu' })
    }

    await room.destroy()

    return res.status(200).json({ message: 'Xóa phòng thi thành công' })
  } catch (error) {
    console.error('Lỗi khi xóa phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}

// Bắt đầu phòng thi
export const startExamRoom = async (req, res) => {
  try {
    const { id } = req.params
    const teacher_id = req.user.userId

    const room = await ExamRoom.findOne({ where: { id, teacher_id } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }
    if (room.status !== 'pending') {
      return res.status(400).json({ message: 'Phòng thi đã bắt đầu hoặc kết thúc' })
    }

    await room.update({ status: 'active', started_at: new Date() })

    return res.status(200).json({ message: 'Bắt đầu phòng thi thành công', room })
  } catch (error) {
    console.error('Lỗi khi bắt đầu phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}

// Kết thúc phòng thi
export const endExamRoom = async (req, res) => {
  try {
    const { id } = req.params
    const teacher_id = req.user.userId

    const room = await ExamRoom.findOne({ where: { id, teacher_id } })
    if (!room) {
      return res.status(404).json({ message: 'Phòng thi không tồn tại' })
    }
    if (room.status !== 'active') {
      return res.status(400).json({ message: 'Phòng thi chưa bắt đầu hoặc đã kết thúc' })
    }

    await room.update({ status: 'ended', ended_at: new Date() })

    return res.status(200).json({ message: 'Kết thúc phòng thi thành công', room })
  } catch (error) {
    console.error('Lỗi khi kết thúc phòng thi', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}