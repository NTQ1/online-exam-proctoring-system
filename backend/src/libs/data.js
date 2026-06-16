import { sequelize } from '../config/database.js'
import User from '../models/User.js'
import ExamRoom from '../models/ExamRoom.js'
import ExamParticipant from '../models/ExamParticipant.js'
import MonitoringSession from '../models/MonitoringSession.js'
import ViolationEvent from '../models/ViolationEvent.js'
import BlockchainRecord from '../models/BlockchainRecord.js'

// Định nghĩa quan hệ giữa các model
User.hasMany(ExamRoom, { foreignKey: 'teacher_id', as: 'exam_rooms' })
ExamRoom.hasMany(ExamParticipant, { foreignKey: 'room_id', as: 'participants' })
ExamParticipant.hasMany(MonitoringSession, { foreignKey: 'participant_id', as: 'sessions' })
ExamParticipant.hasMany(ViolationEvent, { foreignKey: 'participant_id', as: 'violations' })
MonitoringSession.belongsTo(ExamParticipant, { foreignKey: 'participant_id', as: 'participant' })
MonitoringSession.hasMany(ViolationEvent, { foreignKey: 'session_id', as: 'violations' })
MonitoringSession.hasMany(BlockchainRecord, { foreignKey: 'session_id', as: 'blockchain_records' })
ViolationEvent.belongsTo(ExamParticipant, { foreignKey: 'participant_id', as: 'participant' })
ViolationEvent.belongsTo(MonitoringSession, { foreignKey: 'session_id', as: 'session' })
BlockchainRecord.belongsTo(MonitoringSession, { foreignKey: 'session_id', as: 'session' })

export async function connectDB() {
  try {
    await sequelize.authenticate()
    console.log('Kết nối database thành công')

    await sequelize.sync({ force: false }) 
    console.log('Đồng bộ bảng thành công')

  } catch (error) {
    console.error('Kết nối database thất bại:', error.message)
    process.exit(1)
  }
}