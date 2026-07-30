import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicket, assignTicket, changeTicketStatus, TicketError } from "../src/ticketService.js";
import { FakeTicketsRepository } from "./fakeRepository.js";
import { FakeIdentityRepository } from "../../../Platform-Services/Identity/test/fakeIdentityRepository.js";

function baseInput(overrides: Partial<Parameters<typeof createTicket>[2]> = {}) {
  return {
    subject: "Devices stuck offline",
    description: "Three enforcement agents show offline since this morning.",
    category: "bug" as const,
    source: "customer" as const,
    ...overrides,
  };
}

test("createTicket defaults to open status, medium priority, and category-routed team", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());

  assert.equal(ticket.status, "open");
  assert.equal(ticket.priority, "medium");
  assert.equal(ticket.team, "engineering"); // "bug" category
  assert.equal(ticket.assignedToStaffId, null);
});

test("createTicket honors an explicit priority and team override", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(
    repo,
    identityRepo,
    baseInput({ category: "bug", priority: "urgent", team: "support" }),
  );
  assert.equal(ticket.priority, "urgent");
  assert.equal(ticket.team, "support", "explicit team overrides the category default");
});

test("createTicket stores reporter contact info for a customer-sourced ticket", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(
    repo,
    identityRepo,
    baseInput({ organizationId: "org-1", reporterName: "Jane Doe", reporterEmail: "jane@acme.example" }),
  );
  assert.equal(ticket.organizationId, "org-1");
  assert.equal(ticket.reporterEmail, "jane@acme.example");
  assert.equal(ticket.source, "customer");
});

test("createTicket rejects an empty subject", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  await assert.rejects(
    () => createTicket(repo, identityRepo, baseInput({ subject: "   " })),
    (err: unknown) => err instanceof TicketError && err.code === "invalid_input",
  );
});

test("createTicket rejects an empty description", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  await assert.rejects(
    () => createTicket(repo, identityRepo, baseInput({ description: "" })),
    (err: unknown) => err instanceof TicketError && err.code === "invalid_input",
  );
});

test("assignTicket sets the assignee and moves an open ticket to in_progress", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());

  const updated = await assignTicket(repo, ticket.id, "staff-1");

  assert.equal(updated.assignedToStaffId, "staff-1");
  assert.equal(updated.status, "in_progress");
});

test("assignTicket does not change status for a ticket that's already past open", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  await changeTicketStatus(repo, ticket.id, "waiting_on_customer");

  const updated = await assignTicket(repo, ticket.id, "staff-1");

  assert.equal(updated.status, "waiting_on_customer", "reassignment must not regress status");
});

test("assignTicket to null unassigns without forcing a status change", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  await assignTicket(repo, ticket.id, "staff-1");

  const updated = await assignTicket(repo, ticket.id, null);
  assert.equal(updated.assignedToStaffId, null);
});

test("assignTicket throws for an unknown ticket", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  await assert.rejects(
    () => assignTicket(repo, "ghost-ticket", "staff-1"),
    (err: unknown) => err instanceof TicketError && err.code === "ticket_not_found",
  );
});

test("changeTicketStatus follows a valid transition and stamps resolvedAt", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  const now = new Date("2026-07-20T12:00:00Z");

  const updated = await changeTicketStatus(repo, ticket.id, "resolved", now);

  assert.equal(updated.status, "resolved");
  assert.equal(updated.resolvedAt?.toISOString(), now.toISOString());
});

test("changeTicketStatus stamps closedAt when closing, and clears it on reopen to open", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  const closedAt = new Date("2026-07-20T12:00:00Z");
  await changeTicketStatus(repo, ticket.id, "closed", closedAt);

  const reopened = await changeTicketStatus(repo, ticket.id, "open");
  assert.equal(reopened.closedAt, null);
});

test("changeTicketStatus rejects an invalid transition (e.g. resolved straight to waiting_on_customer)", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  await changeTicketStatus(repo, ticket.id, "resolved");

  await assert.rejects(
    () => changeTicketStatus(repo, ticket.id, "waiting_on_customer"),
    (err: unknown) => err instanceof TicketError && err.code === "invalid_status_transition",
  );
});

test("changeTicketStatus rejects transitioning out of a closed ticket to anything but open", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  await changeTicketStatus(repo, ticket.id, "closed");

  await assert.rejects(
    () => changeTicketStatus(repo, ticket.id, "in_progress"),
    (err: unknown) => err instanceof TicketError && err.code === "invalid_status_transition",
  );
});

test("changeTicketStatus setting the same status is a no-op, not an error", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());
  const result = await changeTicketStatus(repo, ticket.id, "open");
  assert.equal(result.status, "open");
});

test("changeTicketStatus throws for an unknown ticket", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  await assert.rejects(
    () => changeTicketStatus(repo, "ghost-ticket", "resolved"),
    (err: unknown) => err instanceof TicketError && err.code === "ticket_not_found",
  );
});

test("createTicket generates a real, well-formed TKT- display id", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());

  assert.match(ticket.displayId, /^TKT-\d{8}$/);
  assert.notEqual(ticket.displayId, ticket.id, "displayId is a separate, human-readable field, not an alias for the UUID");
});

test("createTicket assigns sequential display ids across multiple tickets, sharing one identityRepo", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();

  const first = await createTicket(repo, identityRepo, baseInput());
  const second = await createTicket(repo, identityRepo, baseInput());

  assert.equal(first.displayId, "TKT-00000001");
  assert.equal(second.displayId, "TKT-00000002");
});

test("createTicket's displayId survives a round trip through the repository unchanged", async () => {
  const repo = new FakeTicketsRepository();
  const identityRepo = new FakeIdentityRepository();
  const ticket = await createTicket(repo, identityRepo, baseInput());

  const stored = await repo.getTicketById(ticket.id);
  assert.equal(stored?.displayId, ticket.displayId);
});
