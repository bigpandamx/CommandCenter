import type { Pool } from "pg";
import type { AIChatRepository } from "../../../Customer-Connections/AIChat/src/repository.js";
import type { ChatMessage, Conversation } from "../../../Customer-Connections/AIChat/src/types.js";

export class PgAIChatRepository implements AIChatRepository {
  constructor(private readonly pool: Pool) {}

  async createConversation(conversation: Conversation): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_chat_conversations (id, organization_id, device_id, status, started_at, last_message_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        conversation.id,
        conversation.organizationId,
        conversation.deviceId,
        conversation.status,
        conversation.startedAt,
        conversation.lastMessageAt,
      ],
    );
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ai_chat_conversations WHERE id = $1`, [id]);
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async updateConversation(conversation: Conversation): Promise<void> {
    await this.pool.query(
      `UPDATE ai_chat_conversations SET status = $2, last_message_at = $3 WHERE id = $1`,
      [conversation.id, conversation.status, conversation.lastMessageAt],
    );
  }

  async getActiveConversationForDevice(deviceId: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ai_chat_conversations
       WHERE device_id = $1 AND status = 'active'
       ORDER BY last_message_at DESC
       LIMIT 1`,
      [deviceId],
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async appendMessage(message: ChatMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_chat_messages (id, conversation_id, role, content, tokens_used, model, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.tokensUsed,
        message.model,
        message.createdAt,
      ],
    );
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ai_chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows.map(mapMessage);
  }

  async listRecentConversations(limit: number): Promise<Conversation[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ai_chat_conversations ORDER BY last_message_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapConversation);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    deviceId: row.device_id,
    status: row.status,
    startedAt: row.started_at,
    lastMessageAt: row.last_message_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    tokensUsed: row.tokens_used,
    model: row.model,
    createdAt: row.created_at,
  };
}
