import { useAuthStore } from '@/stores/useAuthStore';
import axios from 'axios';
import { use } from 'react';

const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL ?? 'http://localhost:5001'}/api`,
    withCredentials: true, // Cho phép gửi cookie nếu cần
});

// gắn access token
api.interceptors.request.use((config) => {
    const { accessToken } = useAuthStore.getState(); // Lấy access token từ Zustand store 
    if (accessToken) {
        config.headers['Authorization'] = `Bearer ${accessToken}`; // Gắn token vào header Authorization
    }
    return config;
});
// Xử lý lỗi 401 để tự động refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const res = await api.post('/auth/refresh', {}, { withCredentials: true })
        const newAccessToken = res.data.accessToken

        useAuthStore.getState().setAccessToken(newAccessToken)
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`

        return api(originalRequest)
      } catch {
        useAuthStore.getState().clearState()
        window.location.href = '/signin'
      }
    }

    return Promise.reject(error)
  }
)
export default api