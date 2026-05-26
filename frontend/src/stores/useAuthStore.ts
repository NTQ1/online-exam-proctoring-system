import {create} from "zustand";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import type { AuthState } from "@/types/store";

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  loading: false,
    setAccessToken: (token: string) => set({ accessToken: token }),
    clearState: () => set({ accessToken: null, user: null, loading: false }), // Hàm để xóa trạng thái khi đăng xuất

  signUp: async (username, email, password, firstName, lastName, role) => {
    try {
      set({ loading: true });
      await authService.signUp(username, email, password, firstName, lastName, role);
      toast.success("Đăng ký thành công! Vui lòng đăng nhập.");
    } catch (error) {
      console.error(error);
      toast.error("Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      set({ loading: false });
    }
  },

  signin: async (username, password) => {
      try {
        set({ loading: true });
        const res = await authService.signin(username, password);
        set({ accessToken: res.accessToken, user: res.user }); // ✅ lưu user
        toast.success("Đăng nhập thành công!");
      } catch (error) {
        console.error(error);
        toast.error("Đăng nhập thất bại. Vui lòng thử lại.");
      } finally {
        set({ loading: false });
      }
    },

  signOut: async () => {
    try {
        get().clearState(); // Xóa trạng thái trước khi gọi API đăng xuất
        await authService.signOut(); // Gọi API đăng xuất
        toast.success("Đăng xuất thành công!");
    } catch (error) {
        console.error(error);
        toast.error("Đăng xuất thất bại. Vui lòng thử lại.");
    }
  },
  fetchMe: async () => {
    try {
      set({ loading: true });
      const user = await authService.fetchMe();
      set({ user}); // Cập nhật thông tin người dùng vào state
    } catch (error) {
      console.error(error);
      set({ user: null, accessToken: null }); // Nếu có lỗi (ví dụ: token không hợp lệ), xóa thông tin người dùng và token
      toast.error("Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.");
    }
    finally {
      set({ loading: false });
    }
  }
}));