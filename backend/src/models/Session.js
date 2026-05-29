import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import User from './User.js'
const RefreshToken = sequelize.define('RefreshToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  user_id: {
    type: DataTypes.INTEGER, 
    allowNull: false, 
  },

  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: false, 
    unique: true, // Đảm bảo mỗi refresh token là duy nhất
  },

  expires_at: {
    type: DataTypes.DATE, // Thời điểm hết hạn của refresh token
    allowNull: false,
  },

}, {
  tableName: 'refresh_tokens', 
  timestamps: true, // Tự động thêm createdAt và updatedAt
})
RefreshToken.associate = (models) => {
  RefreshToken.belongsTo(models.User, { foreignKey: 'user_id' })
} // Định nghĩa quan hệ 1-1 giữa RefreshToken và User

export default RefreshToken