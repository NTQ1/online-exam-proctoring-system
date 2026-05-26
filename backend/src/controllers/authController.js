import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User  from '../models/User.js'
import crypto from 'crypto'
import Session from '../models/Session.js'

const ACCESS_TOKEN_TTL = '30m' // 30 phút
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày 
// Đăng ký tài khoản mới
export const signUp = async (req, res) => {
  try {
    // kiểm tra dữ liệu đầu vào
    const { username, email, password, first_name, last_name, phone, student_id, role } = req.body

    if (!username || !email || !password || !first_name || !last_name) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' })
        }


    // kiểm tra trùng username
    const duplicate = await User.findOne({ where: { username } })
    if (duplicate) {
      return res.status(400).json({ message: 'Username đã tồn tại' })
    }


    //mã hoá mật khẩu
    const password_hash = await bcrypt.hash(password, 10)


    // tạo user mới
    const user = await User.create({
      username,
      email,
      password_hash,
      first_name,
      last_name,
      role,
    })

    return res.status(201).json({
      message: 'Đăng ký thành công',})
  } catch (error) {
    console.error('Lỗi khi gọi signUp', error)
    //return
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}
//  Đăng nhập
export const signIn = async (req, res) => {
  try {
    // lấy input
     const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }
    // so sánh hashpassword vs password
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: 'Username và Password không chính xác' });
    }

    const passwordCorrect = await bcrypt.compare(password, user.password_hash);
    if (!passwordCorrect) {
      return res.status(401).json({ message: 'Username và Password không chính xác' });
    } 
    // tạo token
    const accessToken = jwt.sign({ userId: user.id, role: user.role },
       process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    // tao refresh token
    const refreshToken = crypto.randomBytes(64).toString('hex');
    // lưu refresh token vào database
    user.refresh_token = refreshToken;
    await user.save();

    // Xóa session cũ của user này trước
    await Session.destroy({ where: { user_id: user.id } })
    
    // tạo session mới để lưu refresh token
    await Session.create({
      user_id: user.id,
      refreshToken,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL), 
    });

    // trả refresh token về cookies
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, // chỉ cho phép truy cập từ server
      secure: true, // chỉ gửi cookie qua HTTPS
      sameSite: 'none', //backend và frontend khác domain nên phải để none
      maxAge: REFRESH_TOKEN_TTL,
    });

    //trả access token về client
    return res.status(200).json({
        message: `User ${user.first_name} ${user.last_name} đăng nhập thành công`, 
        accessToken,
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email
        }
      });
  } catch (error) {
    console.error('Lỗi khi gọi signIn', error)
    //return
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }}
// Đăng xuất
export const signOut = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken

    if (token) {
      // Xoá refresh token khỏi session
      await Session.destroy({ where: { refreshToken: token } });

      // Xoá cookie
      res.clearCookie('refreshToken');
    }

    return res.status(204).send();
    
    
  } catch (error) {
    console.error('Lỗi khi gọi signOut', error)
    return res.status(500).json({ message: 'Lỗi hệ thống'})
  }
}
// tự động gửi refesh token mới khi access token hết hạn
export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken

    if (!token) {
      return res.status(401).json({ message: 'Không có refresh token' })
    }

    // Tìm session trong DB
    const session = await Session.findOne({ where: { refreshToken: token } })
    if (!session) {
      return res.status(401).json({ message: 'Refresh token không hợp lệ' })
    }

    // Kiểm tra hết hạn
    if (new Date() > new Date(session.expires_at)) {
      await session.destroy()
      return res.status(401).json({ message: 'Refresh token đã hết hạn, vui lòng đăng nhập lại' })
    }

    // Tìm user
    const user = await User.findByPk(session.user_id)
    if (!user) {
      return res.status(401).json({ message: 'User không tồn tại' })
    }

    // Cấp access token mới
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    )

    return res.status(200).json({ accessToken })
  } catch (error) {
    console.error('Lỗi khi refresh token', error)
    return res.status(500).json({ message: 'Lỗi hệ thống', error: error.message })
  }
}