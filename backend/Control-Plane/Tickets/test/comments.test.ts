import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicket } from "../src/ticketService.js";
import { addTicketComment } from "../src/comments.js";
import { TicketError } from "../src/ticketService.js";
import { FakeTicketsRepository } from "./fakeRepository.js";
import { FakeIdentityRepository } from "../../../Platform-Services/Identity/test/fakeIdentityRepository.js";

async function seedTicket(repo: FakeTicketsRepository) {
  return createTicket(repo, new FakeIdentityRepository(), {
    subject: "Devices stuck offline",
    description: "Three enforcement agents show offline.",
    category: "bug",
    source: "customer",
  });
}

test("addTicketComment stores the comment and bumps the ticket's updatedAt", async () => {
  const repo = new FakeTicketsRepository();
  const ticket = await seedTicket(repo);
  const now = new Date("2026-07-20T12:00:00Z");

  const comment = await addTicketComment(repo, ticket.id, "staff-1", "Looking into this now.", now);

  assert.equal(comment.body, "Looking into this now.");
  assert.equal(comment.authorStaffId, "staff-1");

  const stored = await repo.getTicketById(ticket.id);
  assert.equal(stored?.updatedAt.toISOString(), now.toISOString());
});

test("addTicketComment trims whitespace from the body", async () => {
  const repo = new FakeTicketsRepository();
  const ticket = await seedTicket(repo);
  const comment = await addTicketComment(repo, ticket.id, "staff-1", "  trimmed  ");
  assert.equal(comment.body, "trimmed");
});

test("addTicketComment rejects an empty comment", async () => {
  const repo = new FakeTicketsRepository();
  const ticket = await seedTicket(repo);
  await assert.rejects(
    () => addTicketComment(repo, ticket.id, "staff-1", "   "),
    (err: unknown) => err instanceof TicketError && err.code === "invalid_input",
  );
});

test("addTicketComment throws for an unknown ticket", async () => {
  const repo = new FakeTicketsRepository();
  await assert.rejects(
    () => addTicketComment(repo, "ghost-ticket", "staff-1", "hello"),
    (err: unknown) => err instanceof TicketError && err.code === "ticket_not_found",
  );
});

test("comments come back in chronological order", async () => {
  const repo = new FakeTicketsRepository();
  const ticket = await seedTicket(repo);
  await addTicketComment(repo, ticket.id, "staff-1", "first", new Date("2026-07-20T10:00:00Z"));
  await addTicketComment(repo, ticket.id, "staff-2", "second", new Date("2026-07-20T11:00:00Z"));

  const comments = await repo.listComments(ticket.id);
  assert.equal(comments.length, 2);
  assert.equal(comments[0]?.body, "first");
  assert.equal(comments[1]?.body, "second");
});
