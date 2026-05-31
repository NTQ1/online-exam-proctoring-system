import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import ExamRoom from './ExamRoom.js'

const ExamParticipant = sequelize.define('ExamParticipant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  room_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: ExamRoom,
      key: 'id',
    },
  },
  student_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  student_id_string: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('offline', 'online', 'suspicious'),
    allowNull: false,
    defaultValue: 'offline',
  },
  joined_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  online_duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'exam_participants',
  timestamps: true,
})

ExamParticipant.belongsTo(ExamRoom, { foreignKey: 'room_id', as: 'room' })

export default ExamParticipant