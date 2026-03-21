/* TypeScript interfaces matching the backend API schemas */

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  department: string | null;
  is_admin: boolean;
  is_local_account: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  is_pinned: boolean;
  archived_at: string | null;
  last_message_preview: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  token_count: number | null;
  created_at: string;
  imageUrls?: { name: string; url: string }[];
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  model?: string;
  agent_id?: string;
}

export interface ChatResponse {
  message: Message;
  conversation_id: string;
}

// Streaming response types (NDJSON)
export interface StreamMeta {
  type: "meta";
  conversation_id: string;
  message_id: string;
}

export interface StreamToken {
  type: "token";
  content: string;
}

export interface StreamDone {
  type: "done";
  message_id: string;
}

export type StreamChunk = StreamMeta | StreamToken | StreamDone;

export interface UserSettings {
  theme: "light" | "dark" | "system";
  preferred_model: string | null;
  data_retention_days: number;
  system_prompt: string | null;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  display_name: string;
  email?: string;
  department?: string;
  is_admin?: boolean;
}

export interface ModelsResponse {
  models: string[];
  default: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  timestamp: string;
}

export interface SystemHealth {
  status: string;
  database: string;
  llm_service: string;
  active_users_24h: number;
  total_conversations: number;
  total_messages: number;
  uptime_seconds: number;
}

export interface UsageMetrics {
  total_users: number;
  active_users_today: number;
  active_users_week: number;
  total_conversations: number;
  total_messages: number;
  messages_today: number;
  avg_messages_per_conversation: number;
}

export interface ModelInfo {
  name: string;
  size: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  digest: string | null;
  family: string | null;
  parameter_size: string | null;
  quantization_level: string | null;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  department: string | null;
  is_admin: boolean;
  is_active: boolean;
  is_local_account: boolean;
  last_login: string | null;
  created_at: string;
}

export interface AdminSettings {
  app_name: string;
  app_env: string;
  ad_enabled: boolean;
  ad_server: string;
  ad_port: number;
  ad_use_ssl: boolean;
  ad_domain: string;
  ad_base_dn: string;
  ad_user_search_base: string;
  ad_group_search_base: string;
  ad_bind_user: string;
  ad_admin_group: string;
  llm_provider: string;
  llm_base_url: string;
  llm_default_model: string;
  llm_timeout: number;
  llm_max_tokens: number;
  llm_temperature: number;
  session_expire_minutes: number;
  session_cookie_secure: boolean;
  session_cookie_samesite: string;
  rate_limit_requests: number;
  rate_limit_window_seconds: number;
  attachments_enabled: boolean;
  attachments_max_size_mb: number;
  attachments_max_extract_chars: number;
  log_level: string;
  chat_max_context_messages: number;
  chat_max_context_chars: number;
  local_admin_enabled: boolean;
  local_admin_username: string;
}

export interface DatabaseInfo {
  host: string;
  port: number;
  name: string;
  user: string;
  pool_size: number;
  max_overflow: number;
  db_size: string;
  db_version: string;
  tables: Record<string, number>;
  total_rows: number;
}

/* ───── Feature Types ───── */

export interface MessageFeedback {
  id: string;
  message_id: string;
  is_positive: boolean;
  comment: string | null;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  is_system: boolean;
  usage_count: number;
  created_at: string;
}

export interface TemplateCategory {
  category: string;
  count: number;
}

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: "info" | "warning" | "maintenance";
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface SharedConversation {
  share_token: string;
  share_url: string;
}

export interface MessageBookmark {
  id: string;
  message_id: string;
  note: string | null;
  message_preview: string;
  conversation_id: string;
  created_at: string;
}

export interface UserStats {
  total_conversations: number;
  total_messages: number;
  messages_this_week: number;
  messages_this_month: number;
  total_uploads: number;
  top_models: { model: string; count: number }[];
}

/* ───── V2 Types ───── */

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  system_prompt: string;
  temperature: number;
  preferred_model: string | null;
  max_tokens: number | null;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  allowed_roles: string[] | null;
  allowed_departments: string[] | null;
  knowledge_base_id: string | null;
  usage_count: number;
  created_at: string;
}

export interface AIMemory {
  id: string;
  user_id: string | null;
  department: string | null;
  scope: "user" | "department" | "organization";
  category: "preference" | "fact" | "context" | "skill";
  key: string;
  content: string;
  confidence: number;
  source: "auto" | "explicit" | "admin";
  access_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface AgentSkill {
  id: string;
  agent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  skill_type: "prompt_chain" | "template" | "extraction";
  input_schema: Record<string, { type: string; label: string }> | null;
  output_format: string;
  is_active: boolean;
  is_system: boolean;
  requires_approval: boolean;
  usage_count: number;
  avg_rating: number | null;
  created_at: string;
}

export interface SkillExecution {
  id: string;
  skill_id: string;
  user_id: string;
  status: "pending" | "running" | "completed" | "failed";
  inputs: Record<string, string> | null;
  result: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  type: "info" | "warning" | "task_result" | "alert";
  source: string | null;
  is_read: boolean;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  is_public: boolean;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  total_chunks: number;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledge_base_id: string;
  title: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  chunk_count: number;
  error_message: string | null;
  version: number;
  created_at: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}
