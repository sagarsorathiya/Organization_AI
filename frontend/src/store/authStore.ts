import { create } from "zustand";
import type { User } from "@/types";
import { post, get } from "@/api/client";
import type { LoginResponse } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("auth_token"),
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      localStorage.setItem("auth_token", data.token);
      set({ user: data.user, token: data.token, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Login failed";
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await post("/auth/logout");
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem("auth_token");
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      set({ user: null, token: null });
      return;
    }
    try {
      const user = await get<User>("/auth/me");
      set({ user, token });
    } catch {
      localStorage.removeItem("auth_token");
      set({ user: null, token: null });
    }
  },

  clearError: () => set({ error: null }),

  changePassword: async (oldPassword: string, newPassword: string) => {
    await post("/auth/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  },
}));
