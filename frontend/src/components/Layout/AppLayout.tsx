import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { X } from "lucide-react";

export function AppLayout() {
  const navigate = useNavigate();
  const { user, checkAuth } = useAuthStore();
  const { loadConversations } = useChatStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    checkAuth().then(() => {
      if (!useAuthStore.getState().user) {
        navigate("/login");
      }
    });
  }, [checkAuth, navigate]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-surface-500">Checking authentication...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-surface-900">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar />
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <Sidebar />
          <button
            onClick={() => setDrawerOpen(false)}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <Header
          onMenuClick={() => setDrawerOpen(true)}
          showMenuButton
        />
        <AnnouncementBanner />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
