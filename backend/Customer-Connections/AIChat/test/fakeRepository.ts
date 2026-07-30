import type { AIChatRepository } from "../src/repository.js";
import type { ChatMessage, Conversation } from "../src/types.js";

export class FakeAIChatRepository implements AIChatRepository {
  conversations = new Map<string, Conversation>();
  messages: ChatMessage[] = [];

  async createConversation(conversation: Conversation) {
    this.conversations.set(conversation.id, conversation);
  }

  async getConversationById(id: string) {
    return this.conversations.get(id) ?? null;
  }

  async updateConversation(conversation: Conversation) {
    this.conversations.set(conversation.id, conversation);
  }

  async getActiveConversationForDevice(deviceId: string) {
    const matches = [...this.conversations.values()]
      .filter((c) => c.deviceId === deviceId && c.status === "active")
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    return matches[0] ?? null;
  }

  async appendMessage(message: ChatMessage) {
    this.messages.push(message);
  }

  async listMessages(conversationId: string) {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listRecentConversations(limit: number) {
    return [...this.conversations.values()]
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit);
  }
}
