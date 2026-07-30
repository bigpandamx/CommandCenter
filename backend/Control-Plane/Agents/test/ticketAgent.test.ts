import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlagStaleTicketsHandler } from "../src/ticketAgent.js";
import { FakeTicketsRepository } from "../../Tickets/test/fakeRepository.js";
import { FakeIdentityRepository } from "../../../Platform-Services/Identity/test/fakeIdentityRepository.js";
import { createTicket, changeTicketStatus } from "../../Tickets/src/ticketService.js";

test("flagStaleTickets finds nothing when all tickets are recently updated", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  await createTicket(repo, identityRepo, { subject: "Fresh ticket", description: "desc", category: "bug", source: "customer" });

  const handler = createFlagStaleTicketsHandler(repo, 48);
  const result = await handler({});

  assert.equal(result.success, true);
  assert.equal((result.data.staleCount as number), 0);
  assert.deepEqual(result.recommendations, []);
});

test("flagStaleTickets flags an open ticket with no recent activity past the threshold", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const oldNow = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72h ago
  const ticket = await createTicket(
    repo,
    identityRepo,
    { subject: "Stale ticket", description: "desc", category: "bug", source: "customer" },
    oldNow,
  );

  const handler = createFlagStaleTicketsHandler(repo, 48);
  const result = await handler({});

  assert.equal(result.data.staleCount, 1);
  assert.deepEqual(result.data.staleTicketIds, [ticket.id]);
  assert.match(result.recommendations[0] ?? "", /Stale ticket/);
});

test("flagStaleTickets does not flag resolved or closed tickets, even if old", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const oldNow = new Date(Date.now() - 100 * 60 * 60 * 1000);
  const ticket = await createTicket(
    repo,
    identityRepo,
    { subject: "Old but resolved", description: "desc", category: "bug", source: "customer" },
    oldNow,
  );
  await changeTicketStatus(repo, ticket.id, "resolved", oldNow);

  const handler = createFlagStaleTicketsHandler(repo, 48);
  const result = await handler({});

  assert.equal(result.data.staleCount, 0);
});

test("flagStaleTickets respects a threshold override passed via the task payload", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await createTicket(repo, identityRepo, { subject: "Somewhat old", description: "desc", category: "bug", source: "customer" }, twoHoursAgo);

  const handler = createFlagStaleTicketsHandler(repo, 48); // default 48h wouldn't flag this
  const result = await handler({ staleHours: 1 }); // override to 1h -- should flag it

  assert.equal(result.data.staleCount, 1);
});
