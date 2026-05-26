import React from 'react'
import { Button } from '../ui/button'
import { useAuthStore } from '@/stores/useAuthStore';
import { useNavigate } from 'react-router';

const Logout = () => {
    const {signOut} = useAuthStore();
    const navigate = useNavigate();
    const handleLogout = async () => {
        try {
            await signOut(); // Gọi hàm đăng xuất từ store
            navigate("/signin"); // Chuyển hướng đến trang đăng nhập sau khi đăng xuất thành công
        } catch (error) {
            console.error( error);
        }
    }
  return (
    <Button onClick={handleLogout}>
        Logout
    </Button>
  )
}

export default Logout
