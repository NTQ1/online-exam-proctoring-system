import api from "@/lib/axios";

export const authService = {
    signUp: async (
        username: string, 
        email: string, 
        password: string, 
        firstName: string, 
        lastName: string, 
        role: string
    ) => {
        const res = await api.post('/auth/signup',
                {
                    username, 
                    email, 
                    password, 
                    first_name: firstName,  // ✅
                    last_name: lastName,    // ✅
                    role
                },
                {withCredentials: true}
            ); // Gọi API đăng ký tại đây

        return res.data; // Trả về dữ liệu từ API nếu cần
    },
    signin: async (username: string, password: string) => {
        const res = await api.post('/auth/signin', { username, password }, { withCredentials: true });
        return res.data; // acsessToken và user info sẽ được trả về từ API nếu đăng nhập thành công
    },
    signOut: async () => {
        return api.post('/auth/signout', {}, { withCredentials: true });
    },
    fetchMe: async () => {
        const res = await api.get('/user/me', { withCredentials: true });
        return res.data.user; // Thông tin người dùng sẽ được trả về từ API nếu token hợp lệ
    }
};