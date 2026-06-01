import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import ExamParticipant from './ExamParticipant.js'

const ViolationEvent = sequelize.define('ViolationEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  participant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: ExamParticipant,
      key: 'id',
    },
  },
  session_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'monitoring_sessions',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  severity: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  image_path: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  image_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'violation_events',
  timestamps: true,
})

export default ViolationEvent
