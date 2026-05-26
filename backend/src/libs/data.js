import { Sequelize } from 'sequelize'
import dotenv from 'dotenv'
dotenv.config()

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS || '',
  {
    host:    process.env.DB_HOST || 'localhost',
    port:    process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
)

import User from '../models/User.js'
import ExamRoom from '../models/ExamRoom.js'
import ExamParticipant from '../models/ExamParticipant.js'
import MonitoringSession from '../models/MonitoringSession.js'
import ViolationEvent from '../models/ViolationEvent.js'
import BlockchainRecord from '../models/BlockchainRecord.js'

// Define relationships
User.hasMany(ExamRoom, { foreignKey: 'teacher_id', as: 'exam_rooms' })
ExamRoom.hasMany(ExamParticipant, { foreignKey: 'room_id', as: 'participants' })
ExamParticipant.hasMany(MonitoringSession, { foreignKey: 'participant_id', as: 'sessions' })
ExamParticipant.hasMany(ViolationEvent, { foreignKey: 'participant_id', as: 'violations' })
MonitoringSession.hasMany(ViolationEvent, { foreignKey: 'session_id', as: 'violations' })
MonitoringSession.hasMany(BlockchainRecord, { foreignKey: 'session_id', as: 'blockchain_records' })

export async function connectDB() {
  try {
    await sequelize.authenticate()
    console.log('Kết nối database thành công')

    await sequelize.sync({ force: false, alter: true }) // use alter to apply changes safely
    console.log('Đồng bộ bảng thành công')

  } catch (error) {
    console.error('Kết nối database thất bại:', error.message)
    process.exit(1)
  }
}