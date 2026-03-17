import { create } from "zustand";
import type { Announcement } from "@/types";
import { get } from "@/api/client";

interface AnnouncementState {
  announcements: Announcement[];
  dismissed: Set<string>;
  loadAnnouncements: () => Promise<void>;
  dismiss: (id: string) => void;
  visibleAnnouncements: () => Announcement[];
}

export const useAnnouncementStore = create<AnnouncementState>((set, getState) => ({
  announcements: [],
  dismissed: new Set<string>(),

  loadAnnouncements: async () => {
    try {
      const data = await get<{ announcements: Announcement[] } | Announcement[]>("/announcements");
      const list = Array.isArray(data) ? data : data.announcements ?? [];
      set({ announcements: list });
    } catch {
      // silent
    }
  },

  dismiss: (id: string) => {
    set((s) => {
      const next = new Set(s.dismissed);
      next.add(id);
      return { dismissed: next };
    });
  },

  visibleAnnouncements: () => {
    const { announcements, dismissed } = getState();
    return announcements.filter((a) => !dismissed.has(a.id));
  },
}));
