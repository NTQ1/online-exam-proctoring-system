import jwt from 'jsonwebtoken';
import User from '../models/User.js';


//xác minh userr là ai
export const protectedRoute = async (req, res, next) => {
    try {
        // Lấy token từ header
        const authHeader = req.headers['authorization']; 
        const token = authHeader && authHeader.split(' ')[1]; // Bear <token>
        if (!token) {
            return res.status(401).json({ message: 'Token không tồn tại' });
        }
        //xác nhận token
        const decodedUser = jwt.verify(
            token,
            process.env.ACCESS_TOKEN_SECRET
        );
        //tìm user
       const user = await User.findByPk(decodedUser.userId, { 
            attributes: { exclude: ['password_hash'] }
        }); // lấy tất cả trừ mật khẩu

            if (!user) {
                return res.status(404).json({ message: 'User không tồn tại' });
            }

        //trả user về cho client
        req.user = user; // gắn user vào request để các middleware sau có thể sử dụng
        next(); // chuyển sang middleware tiếp theo
    } catch (error) {
        console.error('Lỗi khi gọi protectedRoute', error);
        return res.status(500).json({ message: 'Lỗi hệ thống' });
    }
}