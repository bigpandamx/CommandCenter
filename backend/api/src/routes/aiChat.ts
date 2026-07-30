/**
 * HTTP transport for Customer-Connections/AIChat. Two auth models,
 * matching Desktop-Apps' and Edge-Devices' existing split:
 *   - Device-facing (/v1/desktop/chat/messages): bearer device API key,
 *     same credential an enrolled Desktop-Apps device already has from
 *     enrollment -- no new identity type introduced.
 *   - Staff-facing (browse conversations): staff session + RBAC
 *     (ai_chat:read), same pattern as every other admin route.
 *
 * The device route and the staff routes are split into separate
 * scopes -- the staff routes' requireStaffSession hook is added inside
 * an app.register(async (staffScope) => {...}) callback, not directly
 * on the shared top-level app. That register() call is what actually
 * isolates the hook: Fastify hooks added directly on a shared instance
 * (via a bare app.addHook(...), not through register()) apply to EVERY
 * route on that instance, regardless of registration order -- this is
 * NOT about declaring routes "before" or "after" the hook textually,
 * despite how that might look from the source order.
 *
 * This distinction was the actual root cause of a real bug: 14 other
 * route files in this directory called app.addHook("preHandler",
 * requireStaffSession(...)) directly on the shared instance, which
 * leaked staff-session auth onto every route registered anywhere on
 * that instance -- including /healthz, which came back 401 in a real
 * CI run instead of 200. All of them now use this same register()
 * scoping pattern; see git history around that fix for the full list.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticateDevice, CheckinError } from "../../../Customer-Connections/Desktop-Apps/src/checkin.js";
import type { DesktopSyncRepository } from "../../../Customer-Connections/Desktop-Apps/src/repository.js";
import { sendMessage, AIChatError } from "../../../Customer-Connections/AIChat/src/chatService.js";
import type { AIChatRepository } from "../../../Customer-Connections/AIChat/src/repository.js";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";

function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function checkPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: Parameters<typeof assertPermission>[1],
): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, permission);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

const sendMessageSchema = z.object({
  deviceId: z.string().uuid(),
  content: z.string().min(1),
});

const aiChatErrorStatus: Record<AIChatError["code"], number> = {
  not_found: 404,
  invalid_input: 400,
  conversation_closed: 409,
  quota_exceeded: 429,
  not_entitled: 403,
};

const checkinErrorStatus: Record<CheckinError["code"], number> = {
  unauthorized: 401,
  device_not_found: 404,
  device_revoked: 403,
};

/**
 * Registered from server.ts only when an AIProvider is actually
 * configured (see the ANTHROPIC_API_KEY check there) -- AI Chat is a
 * genuinely optional feature nothing else in Command Center depends
 * on, so its absence shouldn't block every other route from coming up,
 * matching how COMPLIANCE_INGESTION_INTERVAL_MS <= 0 disables that
 * scheduler without disabling the server. `billingRepo` is Subscriptions'
 * existing repository, reused directly (not a new billing system) --
 * see chatService.ts's generateAssistantResponse for the actual quota
 * enforcement.
 */
export function registerAIChatRoutes(
  app: FastifyInstance,
  aiChatRepo: AIChatRepository,
  desktopSyncRepo: DesktopSyncRepository,
  aiProvider: AIProvider,
  billingRepo: BillingRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  // --- Device-facing (bearer device API key) ---

  app.post("/v1/desktop/chat/messages", async (request, reply) => {
    const apiKey = bearerToken(request.headers.authorization);
    if (!apiKey) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      const device = await desktopSyncRepo.getDeviceById(parsed.data.deviceId);
      if (!device) {
        return reply.status(404).send({ error: "device_not_found" });
      }
      if (device.status === "revoked") {
        return reply.status(403).send({ error: "device_revoked" });
      }
      await authenticateDevice(desktopSyncRepo, device.id, apiKey, device.apiKeyHash);

      const organization = await desktopSyncRepo.getOrganization(device.organizationId);
      if (!organization) {
        return reply.status(404).send({ error: "organization_not_found" });
      }

      const result = await sendMessage(aiChatRepo, aiProvider, billingRepo, organization, device.id, parsed.data.content);
      return reply.status(200).send({
        conversationId: result.conversation.id,
        message: result.assistantMessage,
        quotaUsage: result.quotaUsage,
      });
    } catch (err) {
      if (err instanceof CheckinError) {
        return reply.status(checkinErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      if (err instanceof AIChatError) {
        return reply.status(aiChatErrorStatus[err.code]).send({ error: err.code, message: err.message });
      }
      request.log.error(err, "unexpected error handling an AI chat message");
      return reply.status(500).send({ error: "internal_error" });
    }
  });

  // --- Staff-facing (staff session + RBAC) ---
  // Registered inside app.register() specifically for genuine
  // encapsulation: a hook added this way can only affect routes
  // registered within this same callback, which is Fastify's
  // documented plugin-boundary guarantee. A bare app.addHook() on the
  // shared top-level instance (as Edge-Devices' own routes file does)
  // risks applying to whatever server.ts registers afterward on that
  // same instance -- including, later in server.ts,
  // registerServiceApiRoutes's service-account-authenticated routes,
  // which must NOT require a staff session. Worth flagging as
  // something to double-check there rather than silently copying the
  // same pattern into new code.
  app.register(async (staffScope) => {
    staffScope.addHook("preHandler", requireStaffSession(staffAuthRepo));

    staffScope.get("/v1/admin/ai-chat/conversations", async (request, reply) => {
      if (!checkPermission(request, reply, "ai_chat:read")) return;
      const query = request.query as { limit?: string } | undefined;
      const conversations = await aiChatRepo.listRecentConversations(query?.limit ? Number(query.limit) : 50);
      return reply.status(200).send({ conversations });
    });

    staffScope.get("/v1/admin/ai-chat/conversations/:id", async (request, reply) => {
      if (!checkPermission(request, reply, "ai_chat:read")) return;
      const { id } = request.params as { id: string };
      const conversation = await aiChatRepo.getConversationById(id);
      if (!conversation) {
        return reply.status(404).send({ error: "not_found" });
      }
      const messages = await aiChatRepo.listMessages(id);
      return reply.status(200).send({ conversation, messages });
    });
  });
}
