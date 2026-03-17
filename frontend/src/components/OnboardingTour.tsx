import { useState, useEffect } from "react";
import { Bot, MessageSquare, FileText, Shield, Zap, X, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Bot,
    title: "Welcome to AI Assistant",
    desc: "Your private, on-premises AI assistant. All conversations stay within your organization's network.",
  },
  {
    icon: MessageSquare,
    title: "Start a Conversation",
    desc: "Type a message in the input box below to start chatting. Use Ctrl+Shift+N to create a new conversation.",
  },
  {
    icon: FileText,
    title: "Attach Documents",
    desc: "Upload PDF, DOCX, XLSX, and other files using the paperclip icon. The AI can analyze their contents.",
  },
  {
    icon: Shield,
    title: "Enterprise Features",
    desc: "Pin conversations, export chats, use prompt templates, bookmark messages, and share conversations with colleagues.",
  },
  {
    icon: Zap,
    title: "Tips & Shortcuts",
    desc: "Press Ctrl+/ for keyboard shortcuts. Give feedback on responses with thumbs up/down to help improve the system.",
  },
];

const STORAGE_KEY = "onboarding_completed";

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setShow(true);
  }, []);

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShow(false);
  };

  const handleNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else handleFinish();
  };

  if (!show) return null;

  const { icon: Icon, title, desc } = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="relative px-6 pt-8 pb-6 text-center">
          <button
            onClick={handleFinish}
            className="absolute top-3 right-3 p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700"
            aria-label="Skip tour"
          >
            <X size={16} className="text-surface-400" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
            <Icon size={28} className="text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-800 dark:text-surface-100 mb-2">
            {title}
          </h3>
          <p className="text-sm text-surface-500 dark:text-surface-400">{desc}</p>
        </div>

        <div className="flex items-center justify-between px-6 pb-6">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary-600" : "bg-surface-200 dark:bg-surface-600"}`}
              />
            ))}
          </div>
          <button
            onClick={handleNext}
            className="btn-primary text-sm flex items-center gap-1.5 px-4 py-2"
          >
            {step < steps.length - 1 ? (
              <>
                Next <ArrowRight size={14} />
              </>
            ) : (
              "Get Started"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
