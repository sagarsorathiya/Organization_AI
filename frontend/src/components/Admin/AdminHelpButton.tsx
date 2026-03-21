import { useState } from "react";
import { HelpCircle, X, ChevronRight, ChevronDown } from "lucide-react";
import clsx from "clsx";

type Tab = "overview" | "settings" | "users" | "audit" | "models" | "database" | "announcements" | "templates" | "feedback" | "agents" | "knowledge" | "skills" | "tasks";

interface HelpSection {
  title: string;
  items: { q: string; a: string }[];
}

const HELP_DATA: Record<Tab, HelpSection> = {
  overview: {
    title: "Dashboard Overview",
    items: [
      { q: "What does the Overview show?", a: "Real-time system health, usage metrics (total conversations, messages, active users), and service status for Database, LLM, and the app itself." },
      { q: "What do the status colors mean?", a: "Green = healthy, Yellow = degraded performance, Red = service is down or unreachable." },
      { q: "How do I refresh the data?", a: "Click the refresh button (↻) in the top-right corner to reload all metrics." },
    ],
  },
  settings: {
    title: "System Settings",
    items: [
      { q: "How do I change the LLM model?", a: "Go to the LLM Engine section, update the 'Default Model' field to any installed model name (e.g., llama3.2:3b), then click Save." },
      { q: "What is Context Window (num_ctx)?", a: "Controls how many tokens the LLM processes per request. Higher = better memory but slower. 4096 is a good default for most models." },
      { q: "How do I enable file attachments?", a: "In the File Attachments section, toggle 'Enable Attachments' on. Set the max file size (default 10 MB)." },
      { q: "What is LDAP?", a: "LDAP connects to your company's Active Directory for single sign-on. Configure the server URL, Base DN, and Bind DN, then click 'Test Connection'." },
      { q: "How do I change the session timeout?", a: "Under Session settings, adjust the 'Session Expire Minutes' value. Default is 480 (8 hours)." },
    ],
  },
  users: {
    title: "User Management",
    items: [
      { q: "How do I create a new user?", a: "Click '+ New User', fill in username, password, display name, email, and department. Toggle 'Admin' if they need admin access. Click 'Create'." },
      { q: "How do I edit a user?", a: "Click the pencil (✏️) icon next to any user to edit their display name, email, and department." },
      { q: "How do I make someone an admin?", a: "Click the shield icon next to a user to toggle their admin status. Admins can access this panel." },
      { q: "Can I delete a user?", a: "Click the trash icon next to a user. This will deactivate their account but preserve their conversation history." },
    ],
  },
  audit: {
    title: "Audit Logs",
    items: [
      { q: "What is logged?", a: "Every significant action: logins, logouts, messages sent, settings changes, user management actions, and file uploads." },
      { q: "Can I filter the logs?", a: "Logs are shown in reverse chronological order. Each entry shows timestamp, username, action type, resource affected, and IP address." },
      { q: "How long are logs kept?", a: "Based on the data retention setting. Default is 90 days. Adjust in Settings > Data Retention Days." },
    ],
  },
  models: {
    title: "LLM Models",
    items: [
      { q: "How do I install a new model?", a: "Type the model name (e.g., 'gemma3:4b') in the pull input field and click the download button. You can also browse the Popular Models list and click to pull." },
      { q: "How do I set the default model?", a: "Click the star (⭐) icon next to any installed model to make it the default for all users." },
      { q: "How do I delete a model?", a: "Click the trash icon next to any model. This frees up disk space. The default model cannot be deleted." },
      { q: "How much RAM/VRAM do models need?", a: "Roughly: model file size × 1.2. A 4.7 GB model needs ~6 GB RAM. GPU offloading (VRAM) speeds up inference significantly." },
      { q: "Can I update a model?", a: "Click the refresh icon next to a model to re-pull the latest version. This downloads any updates from the Ollama library." },
    ],
  },
  database: {
    title: "Database Management",
    items: [
      { q: "How do I export the database?", a: "Click 'Export All' to download a JSON file containing all conversations, messages, users, and settings." },
      { q: "How do I import data?", a: "Click 'Import' and select a previously exported JSON file. This merges the data into the existing database." },
      { q: "Can I clear a specific table?", a: "Yes, click the trash icon next to any table name. You'll be asked to confirm. This is irreversible!" },
      { q: "What does 'Clear All' do?", a: "Deletes ALL data from all tables except the admin user. Use with extreme caution — this cannot be undone." },
    ],
  },
  announcements: {
    title: "Announcements",
    items: [
      { q: "How do I create an announcement?", a: "Fill in the title, content, select the type (info/warning/success/error), and optionally set an expiry date. Click 'Create'." },
      { q: "What types are available?", a: "Info (blue) = general notices, Warning (yellow) = important alerts, Success (green) = positive updates, Error (red) = critical issues." },
      { q: "Can I disable an announcement?", a: "Click the toggle next to any announcement to enable/disable it without deleting." },
      { q: "Where do announcements appear?", a: "Active announcements show as banners at the top of the chat page for all users." },
    ],
  },
  templates: {
    title: "Prompt Templates",
    items: [
      { q: "What are prompt templates?", a: "Pre-written prompts that help users get started quickly. Users select a template from the chat input area and it fills in the prompt." },
      { q: "How do I create a template?", a: "Enter a title, the prompt content (use {input} as a placeholder for user input), and select a category. Click 'Create'." },
      { q: "What categories are available?", a: "General, Writing, Analysis, Development, HR, Finance, Legal — these help organize templates in the selector." },
      { q: "Can users see all templates?", a: "Yes, all active templates are available to all users from the template selector (📋) in the chat input area." },
    ],
  },
  feedback: {
    title: "User Feedback",
    items: [
      { q: "How do users give feedback?", a: "After each AI response, users can click thumbs up (👍) or thumbs down (👎) and optionally add a comment." },
      { q: "What metrics are shown?", a: "Total feedback count, positive %, satisfaction chart, and recent feedback with the original message context." },
      { q: "How does feedback help?", a: "Review negative feedback to identify model weaknesses. Consider switching models or adjusting system prompts for better results." },
    ],
  },
  agents: {
    title: "AI Agents",
    items: [
      { q: "What are AI Agents?", a: "Custom AI personas with specific system prompts and optional knowledge bases. E.g., 'HR Assistant', 'Code Reviewer', 'Customer Support'." },
      { q: "How do I create an agent?", a: "Click '+ New Agent', provide a name, description, system prompt (personality/instructions), select a model, and optionally link a knowledge base." },
      { q: "What is a system prompt?", a: "Instructions that define the agent's behavior. Example: 'You are an HR assistant. Only answer questions about company policies. Be professional and concise.'" },
      { q: "How do users select an agent?", a: "Users pick an agent from the dropdown next to the model selector in the chat input area. The agent's system prompt is prepended to every conversation." },
      { q: "Can I link a knowledge base?", a: "Yes! Link a knowledge base to give the agent domain-specific information via RAG (Retrieval Augmented Generation). The agent will search the KB for relevant context." },
    ],
  },
  knowledge: {
    title: "Knowledge Bases",
    items: [
      { q: "What are Knowledge Bases?", a: "Collections of documents that agents can search to provide accurate, context-aware answers. Powered by RAG (Retrieval Augmented Generation)." },
      { q: "How do I create one?", a: "Click '+ New Knowledge Base', give it a name and description, then upload documents (PDF, DOCX, TXT, etc.). The system auto-indexes them." },
      { q: "What file formats are supported?", a: "PDF, DOCX, DOC, TXT, CSV, MD, JSON, XML, HTML, RTF, PPTX, XLSX — all common document formats." },
      { q: "How does RAG work?", a: "When a user asks a question, the system searches the knowledge base for relevant chunks, then includes them in the LLM context so the AI can give accurate answers." },
      { q: "How do I connect it to an agent?", a: "Edit an agent and select the knowledge base from the dropdown. The agent will automatically use it for all conversations." },
    ],
  },
  skills: {
    title: "Skills / Prompt Chains",
    items: [
      { q: "What are Skills?", a: "Pre-built prompt workflows that chain multiple steps together. E.g., 'Write email → Review tone → Format' or 'Analyze data → Generate chart description'." },
      { q: "How do I create a skill?", a: "Define a name, description, category, and the prompt chain steps. Each step has a prompt template and an output key that feeds into the next step." },
      { q: "What are prompt chains?", a: "A sequence of prompts where each step's output feeds into the next. This allows complex multi-step AI workflows." },
      { q: "How do users access skills?", a: "From the Skills page in the sidebar. Users select a skill, provide the required input, and the system runs all steps automatically." },
    ],
  },
  tasks: {
    title: "Scheduled Tasks",
    items: [
      { q: "What are scheduled tasks?", a: "Automated jobs that run on a schedule — like data cleanup, report generation, or periodic notifications." },
      { q: "How do I create a task?", a: "Click '+ New Task', set the name, schedule (cron expression), the action to perform, and enable it." },
      { q: "What is a cron expression?", a: "A schedule format: '0 0 * * *' = daily at midnight, '0 */6 * * *' = every 6 hours, '0 9 * * 1' = every Monday at 9 AM." },
      { q: "Can I run a task manually?", a: "Yes, click the play (▶) button next to any task to trigger it immediately, regardless of its schedule." },
    ],
  },
};

const QUICK_TIPS = [
  "💡 Use AI Agents with Knowledge Bases for department-specific assistants",
  "💡 Set up Prompt Templates so users don't start from a blank chat",
  "💡 Check Feedback regularly to see which AI responses need improvement",
  "💡 Pull smaller models (3-4B) for faster responses on limited hardware",
  "💡 Create Announcements to notify users about system changes or tips",
  "💡 Review Audit Logs weekly to monitor usage patterns and security",
];

interface Props {
  activeTab: Tab;
}

export function AdminHelpButton({ activeTab }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const helpSection = HELP_DATA[activeTab];
  const randomTip = QUICK_TIPS[Math.floor(Date.now() / 60000) % QUICK_TIPS.length]; // changes every minute

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setExpandedIdx(null); }}
        className={clsx(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          isOpen
            ? "bg-surface-700 dark:bg-surface-600 text-white rotate-0"
            : "bg-primary-600 hover:bg-primary-700 text-white hover:scale-105"
        )}
        title="Admin Help"
      >
        {isOpen ? <X size={22} /> : <HelpCircle size={24} />}
      </button>

      {/* Help panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[70vh] bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="bg-primary-600 dark:bg-primary-700 px-5 py-4 text-white shrink-0">
            <h3 className="font-semibold text-lg">Admin Help</h3>
            <p className="text-primary-100 text-sm mt-0.5">{helpSection.title}</p>
          </div>

          {/* Tip bar */}
          <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-surface-200 dark:border-surface-700 shrink-0">
            <p className="text-xs text-amber-700 dark:text-amber-300">{randomTip}</p>
          </div>

          {/* FAQ list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {helpSection.items.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-surface-100 dark:border-surface-700 overflow-hidden">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
                >
                  {expandedIdx === idx ? (
                    <ChevronDown size={16} className="text-primary-500 shrink-0 mt-0.5" />
                  ) : (
                    <ChevronRight size={16} className="text-surface-400 shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{item.q}</span>
                </button>
                {expandedIdx === idx && (
                  <div className="px-3 pb-3 pl-8 animate-fadeIn">
                    <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 shrink-0">
            <p className="text-xs text-surface-400 text-center">
              Help updates based on selected section
            </p>
          </div>
        </div>
      )}
    </>
  );
}
