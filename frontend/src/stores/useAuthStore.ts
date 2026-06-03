import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import type { AuthState } from "@/types/store";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      loading: false,
      setAccessToken: (token: string) => set({ accessToken: token }),
      clearState: () => set({ accessToken: null, user: null, loading: false }),

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
          set({ accessToken: res.accessToken, user: res.user });
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
          get().clearState();
          await authService.signOut();
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
          set({ user });
        } catch (error) {
          console.error(error);
          set({ user: null, accessToken: null });
          toast.error("Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.");
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    }
  )
);