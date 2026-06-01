import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import ExamParticipant from './ExamParticipant.js'

const MonitoringSession = sequelize.define('MonitoringSession', {
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
  status: {
    type: DataTypes.ENUM('authenticated', 'active', 'ended', 'finalized'),
    allowNull: false,
    defaultValue: 'authenticated',
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  end_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  end_reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  screenshot_url: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  trigger_blockchain: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  verdict: {
    type: DataTypes.ENUM('clean', 'violated', 'pending'),
    allowNull: true,
  },
  heartbeats: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
}, {
  tableName: 'monitoring_sessions',
  timestamps: true,
})

export default MonitoringSession
