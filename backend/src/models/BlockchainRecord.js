import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import MonitoringSession from './MonitoringSession.js'

const BlockchainRecord = sequelize.define('BlockchainRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  session_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: MonitoringSession,
      key: 'id',
    },
  },
  data_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tx_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  block_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  retry_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'blockchain_records',
  timestamps: true,
})

BlockchainRecord.belongsTo(MonitoringSession, { foreignKey: 'session_id', as: 'session' })

export default BlockchainRecord
