import { DataTypes } from 'sequelize'
import { sequelize } from '../libs/data.js'

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: {
      msg: 'Username đã tồn tại',
    },
    validate: {
      notEmpty: { msg: 'Username không được để trống' },
      len: {
        args: [3, 50],
        msg: 'Username phải từ 3 đến 50 ký tự',
      },
      isAlphanumeric: { msg: 'Username chỉ được chứa chữ và số' },
    },
    set(value) {
      this.setDataValue('username', value.trim().toLowerCase())
    },
  },

  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: {
      msg: 'Email đã tồn tại',
    },
    validate: {
      notEmpty: { msg: 'Email không được để trống' },
      isEmail: { msg: 'Email không đúng định dạng' },
    },
    set(value) {
      this.setDataValue('email', value.trim().toLowerCase())
    },
  },

  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Mật khẩu không được để trống' },
    },
  },

  first_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Tên không được để trống' },
      len: {
        args: [1, 50],
        msg: 'Tên không được quá 50 ký tự',
      },
    },
    set(value) {
      this.setDataValue('first_name', value.trim())
    },
  },

  last_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Họ không được để trống' },
      len: {
        args: [1, 50],
        msg: 'Họ không được quá 50 ký tự',
      },
    },
    set(value) {
      this.setDataValue('last_name', value.trim())
    },
  },

  phone: {
    type: DataTypes.STRING(15),
    allowNull: true,
    validate: {
      is: {
        args: /^[0-9+\-\s]*$/,
        msg: 'Số điện thoại không đúng định dạng',
      },
      len: {
        args: [9, 15],
        msg: 'Số điện thoại phải từ 9 đến 15 ký tự',
      },
    },
    set(value) {
      this.setDataValue('phone', value ? value.trim() : null)
    },
  },



  role: {
    type: DataTypes.ENUM('student', 'admin'),
    allowNull: false,
    defaultValue: 'student',
    validate: {
      isIn: {
        args: [['student', 'admin']],
        msg: 'Role phải là student hoặc admin',
      },
    },
  },

}, {
  tableName: 'users',
  timestamps: true,
})

export default User