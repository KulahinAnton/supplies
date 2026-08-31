"use client";

import type { QueuedOp, SyncError } from "@/lib/offline/operations";

/**
 * Feature 31 — the queue of work done without a signal.
 *
 * IndexedDB rather than localStorage: this is the only copy of something the
 * user believes they have done, and localStorage is synchronous, string-only,
 * and cleared by the same "clear site data" gesture people reach for when an
 * app misbehaves. Losing a shopping trip to that would be unforgivable.
 *
 * Hand-rolled rather than `idb`: one store, four operations, no migrations.
 * A dependency here would be larger than the code it replaced.
 */

const DB_NAME = "supplies-offline";
const DB_VERSION = 1;
const STORE = "outbox";

/**
 * An op that has been sent and refused. It stays in the outbox — dropping it
 * would be deciding on the user's behalf that a take they remember making did
 * not happen — but `failedAt` stops it being retried on every flush, because
 * a shortfall does not become truer for being asked again.
 */
export type OutboxEntry = QueuedOp & {
  failedAt?: string;
  error?: SyncError;
};

/** An entry as it goes back on the wire: the failure marks are ours, not the
 *  server's, and sending them would be sending it fields it never defined. */
export function toOperation(entry: OutboxEntry): QueuedOp {
  const op = { ...entry };
  delete op.failedAt;
  delete op.error;
  return op;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientOpId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** Fires whenever the queue changes, so the banner can count without polling. */
const CHANGED = "supplies:outbox-changed";

export function onOutboxChange(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

function announce() {
  window.dispatchEvent(new Event(CHANGED));
}

export async function enqueue(op: QueuedOp): Promise<void> {
  await tx("readwrite", (store) => store.put(op));
  announce();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await tx<OutboxEntry[]>("readonly", (store) => store.getAll());
  // Oldest first: the order they happened is the order they must apply.
  return all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** Only what a flush should send — anything already refused is left alone. */
export async function listPending(): Promise<OutboxEntry[]> {
  return (await listOutbox()).filter((entry) => !entry.failedAt);
}

export async function removeOps(clientOpIds: readonly string[]): Promise<void> {
  if (clientOpIds.length === 0) return;
  for (const id of clientOpIds) {
    await tx("readwrite", (store) => store.delete(id));
  }
  announce();
}

export async function markFailed(
  clientOpId: string,
  error: SyncError | undefined,
): Promise<void> {
  const entry = await tx<OutboxEntry | undefined>("readonly", (store) =>
    store.get(clientOpId),
  );
  if (!entry) return;
  await tx("readwrite", (store) =>
    store.put({ ...entry, failedAt: new Date().toISOString(), error }),
  );
  announce();
}

/** Puts a refused op back in the queue, at the user's explicit request. */
export async function retryFailed(clientOpId: string): Promise<void> {
  const entry = await tx<OutboxEntry | undefined>("readonly", (store) =>
    store.get(clientOpId),
  );
  if (!entry) return;
  await tx("readwrite", (store) => store.put(toOperation(entry)));
  announce();
}

/**
 * Signing out must NOT empty this. A queue is work the user did and has not
 * been told the fate of; clearing it with the session would discard a shopping
 * trip because someone tapped «Вийти». It is keyed by nothing but the device,
 * and the server checks the household on every operation anyway.
 */
export async function clearOutbox(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
  announce();
}
