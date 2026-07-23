"use client";

// Phase 3.3 — a tiny offline write queue for the logging surfaces. When a log
// action fails because the device is offline, the payload is stored in IndexedDB
// and replayed on the next `online` event. Correctness rests on the server:
// every surface write UPSERTs on a natural key, so a replayed (or double-sent)
// action is an idempotent no-op, not a duplicate. This keeps the client simple —
// no ack tracking, no ordering guarantees needed.

const DB_NAME = "supertrainer-offline";
const STORE = "pending";

export interface QueuedWrite {
  id: string;
  kind: string; // maps to a registered replay handler
  payload: unknown;
  queuedAt: number;
  attempts?: number; // failed replay attempts (for retry-then-shed)
}

// A queued write is only dropped as "poison" after this many failed non-network
// replays — so a transient server 5xx on reconnect doesn't lose real data.
const MAX_ATTEMPTS = 5;

type Handler = (payload: unknown) => Promise<unknown>;

const handlers = new Map<string, Handler>();
let listenerBound = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function put(item: QueuedWrite): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
}

async function all(): Promise<QueuedWrite[]> {
  return (await tx<QueuedWrite[]>("readonly", (s) => s.getAll())) ?? [];
}

async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Register the replay handler for a write kind (once, at module init).
export function registerHandler(kind: string, handler: Handler): void {
  handlers.set(kind, handler);
  if (!listenerBound && typeof window !== "undefined") {
    window.addEventListener("online", () => void flushQueue());
    listenerBound = true;
  }
}

// Run `handler(payload)` now; on a network failure, queue it for replay and
// resolve as "queued" so the UI can show an optimistic, offline-friendly state.
export async function runOrQueue(
  kind: string,
  payload: unknown,
): Promise<{ status: "done"; result: unknown } | { status: "queued" }> {
  const handler = handlers.get(kind);
  if (!handler) throw new Error(`No offline handler registered for "${kind}"`);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offline) {
    try {
      return { status: "done", result: await handler(payload) };
    } catch (err) {
      // Only queue genuine connectivity failures; rethrow real errors so the UI
      // surfaces them (a validation reject shouldn't be silently swallowed).
      if (!isNetworkError(err)) throw err;
    }
  }
  await put({ id: randomId(), kind, payload, queuedAt: Date.now() });
  return { status: "queued" };
}

// Replay everything queued, dropping each item once its handler succeeds. Safe
// to call repeatedly (idempotent server); a still-failing item stays queued.
export async function flushQueue(): Promise<number> {
  let flushed = 0;
  for (const item of await all()) {
    const handler = handlers.get(item.kind);
    if (!handler) continue;
    try {
      await handler(item.payload);
      await remove(item.id);
      flushed++;
    } catch (err) {
      if (isNetworkError(err)) break; // still offline — keep everything for next reconnect
      // Server/validation error: retry a few times (a transient 5xx shouldn't
      // lose the write) before shedding it as poison.
      const attempts = (item.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) await remove(item.id);
      else await put({ ...item, attempts });
    }
  }
  return flushed;
}

export async function pendingCount(): Promise<number> {
  return (await all()).length;
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("fetch") || msg.includes("network") || msg.includes("load failed");
}
