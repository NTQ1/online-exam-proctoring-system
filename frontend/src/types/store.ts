import type { User } from './user';

export interface AuthState {
    accessToken: string | null;
    user: User | null;
    loading: boolean;

    clearState: () => void; // Hàm để xóa trạng thái khi đăng xuất

    signUp: (username: string,
         email: string,
        password: string,
        firstName: string,
        lastName: string,
        role: string,
         ) => Promise<void>;

    signin: (username: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    fetchMe: () => Promise<void>;
    setAccessToken: (token: string) => void;
}