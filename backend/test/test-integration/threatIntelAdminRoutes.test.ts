/**
 * HTTP-layer route tests for threatIntelAdmin.ts -- the same targeted
 * gap serviceApiRoutes.test.ts closed for the service API, applied
 * here for the first time. This route file has grown to 44 routes
 * across many separate rounds of work (Threat Feed, Threat Actors,
 * Campaigns, Techniques, Malware Intelligence, Vulnerabilities,
 * Intelligence Reports, Geographic Intelligence), each verified only
 * by typechecking and a route-hygiene grep for double-registered
 * app.register() blocks -- never by an actual "does this respond"
 * check. That combination cannot detect a route with a real
 * implementation and full domain-level test coverage that was never
 * actually wired up, because the exact bug serviceApiRoutes.test.ts
 * was built for (a missing scopedApp.get() call, found only by
 * grepping during a routine pass) is equally possible here and was
 * never checked for.
 *
 * Rather than hand-write 44 individual app.inject() assertions (which
 * would also silently stop covering new routes the moment someone
 * forgets to add a 45th test), this takes a different approach: parse
 * threatIntelAdmin.ts's own source text for every scopedApp.METHOD("...")
 * call to build the set of routes the file *claims* to register, then
 * use Fastify's own onRoute hook to record the set of routes actually
 * registered at runtime, and assert the two sets are identical. This
 * is exactly what would have caught the original serviceApi.ts bug,
 * generalized so it keeps working as this file keeps growing, without
 * anyone needing to remember to add a new assertion.
 *
 * A handful of representative app.inject() spot checks follow the
 * route-completeness check, confirming a sample of routes (including
 * the two most recently added, Geography and Malware) don't just
 * exist but actually behave: reject an unauthenticated request,
 * reject an unpermissioned one, and succeed for a valid staff session
 * with the right role.
 *
 * Same offline constraint as serviceApiRoutes.test.ts: this sandbox
 * has no outbound network access and cannot npm install fastify, so
 * every test below skips (not fails) if it's unavailable, rather than
 * a static import that would hard-crash the whole file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let fastifyAvailable = true;
let fastifyFactory: (() => import("fastify").FastifyInstance) | undefined;
try {
  const mod = await import("fastify");
  fastifyFactory = mod.default;
} catch {
  fastifyAvailable = false;
}
const t = fastifyAvailable ? test : test.skip;

if (!fastifyAvailable) {
  console.log(
    "SKIPPING threatIntelAdminRoutes.test.ts: fastify is not installed in this environment (no network access to fetch it). Run `npm install` in an environment with registry access to execute these for real.",
  );
}

/** Parses threatIntelAdmin.ts's own source for every scopedApp.METHOD("path") registration call -- the set of routes the file claims to register. */
function getDeclaredRoutesFromSource(): Set<string> {
  const sourcePath = fileURLToPath(new URL("../../api/src/routes/threatIntelAdmin.ts", import.meta.url).toString());
  const source = readFileSync(sourcePath, "utf-8");
  const pattern = /scopedApp\.(get|post|patch|delete)\(\s*"([^"]+)"/g;
  const routes = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    routes.add(`${match[1]!.toUpperCase()} ${match[2]}`);
  }
  return routes;
}

async function buildApp() {
  const { registerThreatIntelAdminRoutes } = await import("../../api/src/routes/threatIntelAdmin.js");
  const { FakeThreatIntelRepository } = await import("../../Control-Plane/Threat-Intelligence/test/fakeRepository.js");
  const { FakeAnnouncementsRepository } = await import("../../Control-Plane/Announcements/test/fakeRepository.js");
  const { FakeOrganizationsRepository } = await import("../../Control-Plane/Organizations/test/fakeRepository.js");
  const { FakeStaffAuthRepository } = await import("../../Platform-Services/Authentication/test/fakeStaffAuthRepository.js");
  const { createStaffUser, login } = await import("../../Platform-Services/Authentication/src/staffAuthService.js");

  const app = fastifyFactory!();
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const organizationsRepo = new FakeOrganizationsRepository();
  const staffAuthRepo = new FakeStaffAuthRepository();

  const registeredRoutes = new Set<string>();
  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    for (const method of methods) {
      registeredRoutes.add(`${method} ${routeOptions.url}`);
    }
  });

  registerThreatIntelAdminRoutes(app, threatIntelRepo, announcementsRepo, staffAuthRepo, organizationsRepo, null);
  // app.register() is lazy -- routes inside the encapsulated plugin
  // (and the onRoute hooks they trigger) don't actually fire until the
  // instance boots. app.inject() does this implicitly for itself, but
  // the route-completeness check below never calls inject() at all, so
  // it needs an explicit, awaited boot first. The offline type stub in
  // this sandbox doesn't declare .ready() on FastifyInstance (real
  // fastify does), hence the cast.
  await (app as unknown as { ready: () => Promise<void> }).ready();

  const operator = await createStaffUser(staffAuthRepo, { email: "operator@example.com", password: "correct horse battery staple", role: "operator" });
  const { sessionToken } = await login(staffAuthRepo, operator.email, "correct horse battery staple");

  const viewer = await createStaffUser(staffAuthRepo, { email: "viewer@example.com", password: "correct horse battery staple", role: "viewer" });
  const { sessionToken: viewerSessionToken } = await login(staffAuthRepo, viewer.email, "correct horse battery staple");

  return { app, threatIntelRepo, registeredRoutes, sessionToken, viewerSessionToken };
}

t("every route threatIntelAdmin.ts's own source declares is actually registered -- the exact gap class this file exists to catch", async () => {
  const { registeredRoutes } = await buildApp();
  const declaredRoutes = getDeclaredRoutesFromSource();

  assert.ok(declaredRoutes.size > 0, "sanity check: the source scan itself must find routes, or this test proves nothing");

  const missing = [...declaredRoutes].filter((r) => !registeredRoutes.has(r));
  assert.deepEqual(missing, [], "every route declared in threatIntelAdmin.ts's own source must actually be registered at runtime");
});

t("GET /v1/admin/threat-intel/geography rejects an unauthenticated request", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "GET", url: "/v1/admin/threat-intel/geography" });
  assert.equal(response.statusCode, 401);
});

t("GET /v1/admin/threat-intel/geography succeeds for an authenticated operator with threat_intel:read", async () => {
  const { app, sessionToken } = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/admin/threat-intel/geography",
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { matches: unknown[] };
  assert.deepEqual(body.matches, [], "no organizations disclosed a country in this fresh fake repo, so an empty match list is correct, not broken");
});

t("PATCH /v1/admin/threat-intel/threat-actors/:id/geography requires threat_intel:manage, not just threat_intel:read", async () => {
  const { app, threatIntelRepo, sessionToken, viewerSessionToken } = await buildApp();
  const { createStaffThreatActor } = await import("../../Control-Plane/Threat-Intelligence/src/threatActorIngestion.js");
  const actor = await createStaffThreatActor(threatIntelRepo, { name: "Test Actor", description: "x" });

  const asViewer = await app.inject({
    method: "PATCH",
    url: `/v1/admin/threat-intel/threat-actors/${actor.id}/geography`,
    headers: { authorization: `Bearer ${viewerSessionToken}` },
    payload: { originCountry: "Russia" },
  });
  assert.equal(asViewer.statusCode, 403, "viewer has threat_intel:read but not threat_intel:manage");

  const asOperator = await app.inject({
    method: "PATCH",
    url: `/v1/admin/threat-intel/threat-actors/${actor.id}/geography`,
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: { originCountry: "Russia" },
  });
  assert.equal(asOperator.statusCode, 200);
  const body = asOperator.json() as { originCountry: string | null };
  assert.equal(body.originCountry, "Russia");
});

t("POST /v1/admin/threat-intel/malware is actually registered and reachable end to end -- one of the most recently added routes", async () => {
  const { app, sessionToken } = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/admin/threat-intel/malware",
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: { name: "Test Malware", description: "x", softwareType: "malware" },
  });
  assert.equal(response.statusCode, 201);
  const body = response.json() as { name: string; source: string };
  assert.equal(body.name, "Test Malware");
  assert.equal(body.source, "staff_curated");
});

t("an unknown route under this same prefix still 404s -- confirms the route-completeness check above isn't trivially passing by matching everything", async () => {
  const { app, sessionToken } = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/admin/threat-intel/this-route-does-not-exist",
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(response.statusCode, 404);
});
