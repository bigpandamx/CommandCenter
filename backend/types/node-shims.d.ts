/**
 * Minimal ambient declarations for the Node built-ins used in this package,
 * standing in for @types/node which can't be npm-installed in this
 * offline sandbox. Real dev/CI environments have network access --
 * delete this file once `npm install` (which pulls in @types/node per
 * package.json) has been run for real.
 */

declare module "node:crypto" {
  export function randomBytes(size: number): Buffer;
  export function randomUUID(): string;
  export function scryptSync(
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
  ): Buffer;
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean;
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: string): string };
  };
}

declare module "node:test" {
  export interface TestOptions {
    timeout?: number;
  }
  export const test: {
    (name: string, fn: () => void | Promise<void>): void;
    /** Registers the test but doesn't run it -- real Node behavior, used to skip a suite gracefully (e.g. an optional dependency isn't installed) rather than letting the whole file crash before any test can even register. */
    skip(name: string, fn: () => void | Promise<void>): void;
  };
  export function before(fn: () => void | Promise<void>, options?: TestOptions): void;
  export function after(fn: () => void | Promise<void>, options?: TestOptions): void;
}

declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:events" {
  export class EventEmitter {
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
  }
}

declare module "node:child_process" {
  import type { EventEmitter } from "node:events";
  export interface ChildProcess extends EventEmitter {
    pid?: number;
    kill(signal?: string): boolean;
    stdout: { on(event: string, listener: (chunk: Buffer) => void) } | null;
    stderr: { on(event: string, listener: (chunk: Buffer) => void) } | null;
    once(event: "exit", listener: (code: number | null, signal: string | null) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
  }
  export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: string | string[];
    detached?: boolean;
  }
  export function spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess;
  export function execFileSync(command: string, args?: string[], options?: SpawnOptions & { stdio?: string; timeout?: number }): Buffer;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(
      fn: () => unknown,
      error?: string | RegExp | ((err: unknown) => boolean) | object,
      message?: string,
    ): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    fail(message?: string): never;
    match(value: string, regexp: RegExp, message?: string): void;
    rejects(
      fn: () => Promise<unknown>,
      error?: unknown,
      message?: string,
    ): Promise<void>;
    doesNotReject(fn: () => Promise<unknown>, message?: string): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}

declare class Buffer extends Uint8Array {
  static from(data: string, encoding?: string): Buffer;
  static byteLength(data: string, encoding?: string): number;
  toString(encoding?: string): string;
  static isBuffer(obj: unknown): obj is Buffer;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  /** e.g. "v22.11.0" -- the running Node.js version. */
  version: string;
  exit(code?: number): never;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  kill(pid: number, signal?: string): boolean;
  /** Real Node process signal handling -- what actually triggers graceful shutdown (SIGTERM from a process supervisor/container orchestrator, SIGINT from a developer's own Ctrl-C). Minimal here: only the two signals this codebase's own shutdown handling actually listens for. */
  on(event: "SIGTERM" | "SIGINT", handler: () => void): void;
};

// Node 22 provides fetch/Response/URL/URLSearchParams natively at runtime;
// these minimal declarations exist only because the offline stand-in for
// @types/node above doesn't include them. Delete alongside the rest of
// this file once real @types/node is installed.
interface Response {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}
declare class AbortController {
  signal: unknown;
  abort(): void;
}
declare function fetch(
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: unknown },
): Promise<Response>;
declare class URL {
  constructor(input: string);
  pathname: string;
  searchParams: URLSearchParams;
}
declare class URLSearchParams {
  constructor();
  set(name: string, value: string): void;
  get(name: string): string | null;
  toString(): string;
}

declare module "pg" {
  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number;
  }
  export class Pool {
    constructor(config?: { connectionString?: string; connectionTimeoutMillis?: number });
    query<T = any>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export class PoolClient {
    query<T = any>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }
}

declare module "fastify" {
  export interface FastifyRequest {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    /** Only populated for routes whose content-type parser preserves it (see addContentTypeParser) -- Stripe webhook signature verification needs the exact raw bytes, not a re-serialized JSON string, which can legitimately differ in whitespace/key order from what Stripe actually sent and signed. */
    rawBody?: string;
    params: unknown;
    query: unknown;
    log: { error: (...args: unknown[]) => void };
    /** e.g. "GET", "POST". */
    method: string;
    /** The raw request path as sent, including any real path-parameter values (e.g. "/v1/admin/tickets/8f3a2c91-..."). For latency tracking's per-service grouping, routeOptions.url below is what's actually wanted -- the route PATTERN, not this. */
    url: string;
    /**
     * Fastify v4's documented way to read the matched route's pattern
     * (e.g. "/v1/admin/tickets/:ticketId") -- the modern replacement
     * for the deprecated `routerPath`. Based on Fastify v4.28's
     * documented API (this codebase's pinned version), not verified
     * against the real package in this sandbox -- same caveat as every
     * other *.pg.ts/offline-checked file here. Undefined only if a
     * hook somehow runs before route matching completes, which
     * shouldn't happen for onResponse (it always fires after a route
     * has been matched and handled).
     */
    routeOptions?: { url?: string };
  }
  export interface FastifyReply {
    status(code: number): FastifyReply;
    send(payload?: unknown): FastifyReply;
    /** Set by Fastify once a response is being sent -- reliably populated by the time an onResponse hook runs, which is the only place this shim's own code reads it. */
    statusCode: number;
  }
  export interface RouteOptions {
    preHandler?: (request: FastifyRequest, reply: FastifyReply) => unknown;
  }
  export interface FastifyInstance {
    get(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    get(path: string, opts: RouteOptions, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    post(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    post(path: string, opts: RouteOptions, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    patch(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    patch(path: string, opts: RouteOptions, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    delete(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    delete(path: string, opts: RouteOptions, handler: (request: FastifyRequest, reply: FastifyReply) => unknown): void;
    addHook(
      name: string,
      hook: (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => void,
    ): void;
    addHook(
      name: "onClose",
      hook: (instance: FastifyInstance, done: (err?: Error) => void) => void,
    ): void;
    /**
     * Real Fastify calls the parser with the raw request stream and
     * expects it to produce the parsed body; the route registering a
     * Stripe webhook handler uses this to also stash the raw bytes onto
     * request.rawBody (via a done(null, {parsed, raw}) convention on its
     * own handler), rather than needing this shim to model streams.
     */
    addContentTypeParser(
      contentType: string,
      opts: { parseAs: "string" | "buffer" },
      parser: (request: FastifyRequest, body: string | Buffer, done: (err: Error | null, result?: unknown) => void) => void,
    ): void;
    /** Real Fastify's register() creates a genuinely encapsulated child context -- hooks added inside the plugin function only affect routes registered within that same callback, not sibling routes registered elsewhere on the parent instance. */
    register(plugin: (instance: FastifyInstance) => Promise<void> | void): void;
    /**
     * Real Fastify's inject() (via light-my-request under the hood)
     * dispatches a request through the actual route tree without
     * binding a real network port -- the only way to test that a route
     * is genuinely registered and reachable, as opposed to every other
     * test in this codebase, which calls domain functions directly
     * against fake repositories and so cannot detect a route that was
     * never wired up at all. Added specifically because that exact gap
     * let a real bug ship undetected (see serviceApi.ts's announcements
     * route fix) -- minimal shape here, only what this codebase's own
     * inject-based tests actually use, not the full real API.
     */
    inject(opts: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      url: string;
      payload?: unknown;
      headers?: Record<string, string>;
    }): Promise<{ statusCode: number; body: string; json(): unknown }>;
    log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
    listen(opts: { port: number; host: string }): Promise<void>;
    /** Triggers every registered onClose hook (Agents' and Jobs' own schedulers both register one) and shuts down the HTTP server. Real Fastify's own graceful-shutdown entry point -- nothing in this codebase called it until server.ts's own SIGTERM/SIGINT handling was added specifically to call it. */
    close(): Promise<void>;
  }
  export type FastifyPluginAsync = (app: FastifyInstance) => Promise<void>;
  export default function Fastify(opts?: { logger?: boolean }): FastifyInstance;
}

declare module "zod" {
  export interface ZodError {
    flatten(): unknown;
  }
  export interface ZodType<T> {
    parse(data: unknown): T;
    safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodError };
    optional(): ZodType<T | undefined>;
    min(n: number): ZodType<T>;
    max(n: number): ZodType<T>;
    uuid(): ZodType<T>;
    regex(re: RegExp): ZodType<T>;
    nonnegative(): ZodType<T>;
    int(): ZodType<T>;
    positive(): ZodType<T>;
    nullable(): ZodType<T | null>;
    nullish(): ZodType<T | null | undefined>;
    passthrough(): ZodType<T & Record<string, unknown>>;
  }
  export const z: {
    object<T extends Record<string, ZodType<any>>>(shape: T): ZodType<{
      [K in keyof T]: T[K] extends ZodType<infer U> ? U : never;
    }>;
    string(): ZodType<string>;
    number(): ZodType<number>;
    boolean(): ZodType<boolean>;
    enum<U extends readonly [string, ...string[]]>(values: U): ZodType<U[number]>;
    array<T>(item: ZodType<T>): ZodType<T[]>;
    unknown(): ZodType<unknown>;
    record<V>(valueType: ZodType<V>): ZodType<Record<string, V>>;
  };
}

// Minimal surface of the real "stripe" SDK actually used by
// Platform-Services/Databases/src/stripeGateway.ts. Real dev/CI
// environments npm-install the real `stripe` package (with its own
// first-party types), which supersedes this. Deliberately only models
// the handful of fields our own code reads off Stripe's response
// objects -- not attempting to mirror Stripe's full (huge) API surface.
declare module "stripe" {
  namespace Stripe {
    interface DeletedCustomer {
      id: string;
      deleted: true;
    }

    interface Customer {
      id: string;
      email?: string | null;
      name?: string | null;
    }

    interface Subscription {
      id: string;
      status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused";
      current_period_start: number; // Unix seconds
      current_period_end: number;
      // Expandable -- a plain string ID unless the request used
      // `expand: ["customer"]`, which this codebase never does, but the
      // real SDK's types account for it regardless.
      customer: string | Customer | DeletedCustomer;
    }

    interface Invoice {
      id: string;
      subscription: string | Subscription | null;
      customer: string | Customer | DeletedCustomer | null;
      total: number; // cents
      currency: string;
      status: "draft" | "open" | "paid" | "void" | "uncollectible" | null;
      period_start: number;
      period_end: number;
    }

    interface Event {
      id: string;
      type: string;
      data: { object: Customer | Subscription | Invoice | Record<string, unknown> };
    }

    interface CustomerCreateParams {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }

    interface SubscriptionCreateParams {
      customer: string;
      items: Array<{ price: string }>;
      metadata?: Record<string, string>;
    }
  }

  class Stripe {
    constructor(apiKey: string, config?: { apiVersion?: string });
    customers: {
      create(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer>;
      retrieve(id: string): Promise<Stripe.Customer>;
    };
    subscriptions: {
      create(params: Stripe.SubscriptionCreateParams): Promise<Stripe.Subscription>;
      cancel(id: string): Promise<Stripe.Subscription>;
      retrieve(id: string): Promise<Stripe.Subscription>;
    };
    webhooks: {
      constructEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event;
    };
  }

  export = Stripe;
}
