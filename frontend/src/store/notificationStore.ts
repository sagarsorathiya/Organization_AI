import { create } from "zustand";
import type { Notification } from "@/types";
import { get, patch } from "@/api/client";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, getState) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  loadNotifications: async () => {
    set({ isLoading: true });
    try {
      const data = await get<{ notifications: Notification[] }>("/notifications");
      set({ notifications: data.notifications, isLoading: false });
      // Update unread count from loaded data
      const unread = data.notifications.filter((n) => !n.is_read).length;
      set({ unreadCount: unread });
    } catch {
      set({ isLoading: false });
    }
  },

  loadUnreadCount: async () => {
    try {
      await get<{ count: number }>("/notifications?limit=0");
      const notifs = getState().notifications;
      set({ unreadCount: notifs.filter((n) => !n.is_read).length });
    } catch {
      // silently fail
    }
  },

  markRead: async (id) => {
    try {
      await patch(`/notifications/${id}/read`, {});
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch {
      // silently fail
    }
  },

  markAllRead: async () => {
    try {
      await patch("/notifications/read-all", {});
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch {
      // silently fail
    }
  },
}));
