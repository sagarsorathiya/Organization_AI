import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "sonner";
import { OnboardingTour } from "@/components/OnboardingTour";

const LoginPage = lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
const ChatPage = lazy(() => import("@/pages/ChatPage").then(m => ({ default: m.ChatPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import("@/pages/AdminPage").then(m => ({ default: m.AdminPage })));
const SharedConversationPage = lazy(() => import("@/pages/SharedConversationPage").then(m => ({ default: m.SharedConversationPage })));
const BookmarksPage = lazy(() => import("@/pages/BookmarksPage").then(m => ({ default: m.BookmarksPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-surface-500">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster richColors position="top-right" />
        <OnboardingTour />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/shared/:token" element={<SharedConversationPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<ChatPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
