/**
 * Stripe webhook endpoint. Unauthenticated by staff/device/service-account
 * standards (Stripe itself is the caller) -- signature verification via
 * STRIPE_WEBHOOK_SECRET is what actually authenticates the request. See
 * addContentTypeParser below for why raw body capture matters here
 * specifically, unlike every other route in this API.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StripeClient } from "../../../Platform-Services/Subscriptions/src/stripeClient.js";
import { StripeSignatureError } from "../../../Platform-Services/Subscriptions/src/stripeClient.js";
import { handleStripeWebhookEvent } from "../../../Platform-Services/Subscriptions/src/stripeIntegration.js";

export function registerStripeWebhookRoutes(
  app: FastifyInstance,
  billingRepo: BillingRepository,
  stripeClient: StripeClient,
  webhookSecret: string,
): void {
  // Fastify's default JSON parser consumes and discards the raw request
  // stream while parsing -- Stripe's signature covers the exact raw
  // bytes it sent, so verifying against a re-serialized JSON.stringify of
  // the parsed body would fail for any payload whose original whitespace
  // or key order differs (which is common; Stripe doesn't guarantee a
  // canonical serialization). Registering a dedicated raw-body parser for
  // this route's content type is what makes signature verification
  // actually correct rather than incidentally-working-in-testing.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, { raw: body, parsed: JSON.parse(body as string) });
    } catch (err) {
      done(err instanceof Error ? err : new Error("Invalid JSON body"));
    }
  });

  app.post("/v1/webhooks/stripe", async (request: FastifyRequest, reply: FastifyReply) => {
    const signatureHeader = request.headers["stripe-signature"];
    if (!signatureHeader || Array.isArray(signatureHeader)) {
      return reply.status(400).send({ error: "missing_signature_header" });
    }

    const body = request.body as { raw: string; parsed: unknown } | undefined;
    if (!body?.raw) {
      return reply.status(400).send({ error: "missing_body" });
    }

    let event;
    try {
      event = stripeClient.constructWebhookEvent(body.raw, signatureHeader, webhookSecret);
    } catch (err) {
      if (err instanceof StripeSignatureError) {
        // Wrong secret or tampered payload -- never process an
        // unverified event, and never leak *why* verification failed
        // beyond a generic 400 (avoids helping an attacker iterate
        // toward a valid signature).
        return reply.status(400).send({ error: "invalid_signature" });
      }
      request.log.error(err, "Unexpected error verifying Stripe webhook signature");
      return reply.status(500).send({ error: "internal_error" });
    }

    try {
      await handleStripeWebhookEvent(billingRepo, event);
    } catch (err) {
      request.log.error(err, `Failed to process Stripe webhook event ${event.id} (${event.type})`);
      // 500 so Stripe retries -- our own processing failure (e.g. a
      // transient DB error) shouldn't be treated the same as "we
      // deliberately don't care about this event type" (handled inside
      // handleStripeWebhookEvent by just returning, not throwing).
      return reply.status(500).send({ error: "processing_failed" });
    }

    return reply.status(200).send({ received: true });
  });
}
