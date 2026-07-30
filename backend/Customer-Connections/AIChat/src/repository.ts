import type { ChatMessage, Conversation } from "./types.js";

export interface AIChatRepository {
  createConversation(conversation: Conversation): Promise<void>;
  getConversationById(id: string): Promise<Conversation | null>;
  updateConversation(conversation: Conversation): Promise<void>;
  /** Most recent active conversation for a device, if any -- lets a caller continue an existing session rather than always starting a new one. */
  getActiveConversationForDevice(deviceId: string): Promise<Conversation | null>;

  appendMessage(message: ChatMessage): Promise<void>;
  /** In chronological order (oldest first) -- the natural order for feeding into an AI provider's message history. */
  listMessages(conversationId: string): Promise<ChatMessage[]>;

  /** Most recent conversations across all devices/orgs, for staff support/audit browsing -- newest first. Deliberately simple for this foundation round: no filtering by org/device/date yet, just "what's happened lately." */
  listRecentConversations(limit: number): Promise<Conversation[]>;
}
