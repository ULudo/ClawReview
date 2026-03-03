import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appRuntimeState } from "@/db/schema";
import type { AppState } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { getStore as getLegacyMemoryStore, MemoryStore, setStore as setLegacyStore } from "@/lib/store/memory";

const RUNTIME_STATE_ROW_ID = "singleton";

type BackendMode = "memory" | "postgres";

let runtimeStore: MemoryStore | null = null;
let runtimeStoreUpdatedAtMs: number | null = null;
let initPromise: Promise<MemoryStore> | null = null;
let persistQueue: Promise<void> = Promise.resolve();
let refreshPromise: Promise<void> | null = null;

function getStateBackendMode(): BackendMode {
  const configured = (process.env.CLAWREVIEW_STATE_BACKEND || "").trim().toLowerCase();
  const isTest = process.env.NODE_ENV === "test";

  if (configured === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("CLAWREVIEW_STATE_BACKEND=postgres requires DATABASE_URL");
    }
    return "postgres";
  }

  if (configured === "memory") {
    return "memory";
  }

  if (isTest) {
    return "memory";
  }

  if (process.env.DATABASE_URL) {
    return "postgres";
  }

  throw new Error(
    "Persistent storage is required. Set DATABASE_URL (recommended) or explicitly set CLAWREVIEW_STATE_BACKEND=memory for ephemeral local development."
  );
}

async function ensureRuntimeStateTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_runtime_state (
      id varchar(64) PRIMARY KEY,
      state_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `);
}

async function loadStateFromPostgres(): Promise<{ state: AppState | null; updatedAtMs: number | null }> {
  await ensureRuntimeStateTable();
  const db = getDb();
  const rows = await db.select().from(appRuntimeState).where(eq(appRuntimeState.id, RUNTIME_STATE_ROW_ID)).limit(1);
  const row = rows[0];
  if (!row) return { state: null, updatedAtMs: null };
  const updatedAtMs = row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
  return {
    state: row.stateJson as AppState,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null
  };
}

async function saveStateToPostgres(state: AppState): Promise<number> {
  await ensureRuntimeStateTable();
  const db = getDb();
  const updatedAt = new Date();
  await db
    .insert(appRuntimeState)
    .values({ id: RUNTIME_STATE_ROW_ID, stateJson: state, updatedAt })
    .onConflictDoUpdate({
      target: appRuntimeState.id,
      set: {
        stateJson: state,
        updatedAt
      }
    });
  return updatedAt.getTime();
}

async function loadStateUpdatedAtFromPostgres(): Promise<number | null> {
  await ensureRuntimeStateTable();
  const db = getDb();
  const rows = await db
    .select({ updatedAt: appRuntimeState.updatedAt })
    .from(appRuntimeState)
    .where(eq(appRuntimeState.id, RUNTIME_STATE_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const value = row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
  return Number.isFinite(value) ? value : null;
}

async function refreshRuntimeStoreFromPostgresIfNeeded(): Promise<void> {
  if (getStateBackendMode() !== "postgres") return;
  if (!runtimeStore) return;
  const remoteUpdatedAtMs = await loadStateUpdatedAtFromPostgres();
  if (remoteUpdatedAtMs == null) return;
  if (runtimeStoreUpdatedAtMs != null && remoteUpdatedAtMs <= runtimeStoreUpdatedAtMs) return;

  const { state, updatedAtMs } = await loadStateFromPostgres();
  if (!state) return;
  const refreshed = new MemoryStore(state);
  runtimeStore = refreshed;
  runtimeStoreUpdatedAtMs = updatedAtMs ?? remoteUpdatedAtMs;
  setLegacyStore(refreshed);
}

async function initializeRuntimeStore(): Promise<MemoryStore> {
  const backend = getStateBackendMode();
  if (backend === "memory") {
    const memoryStore = getLegacyMemoryStore();
    runtimeStore = memoryStore;
    runtimeStoreUpdatedAtMs = null;
    return memoryStore;
  }

  const { state: loadedState, updatedAtMs } = await loadStateFromPostgres();
  const store = loadedState ? new MemoryStore(loadedState) : new MemoryStore();
  runtimeStore = store;
  runtimeStoreUpdatedAtMs = updatedAtMs;
  setLegacyStore(store);

  if (!loadedState) {
    runtimeStoreUpdatedAtMs = await saveStateToPostgres(store.snapshotState());
  }

  return store;
}

export async function getRuntimeStore(): Promise<MemoryStore> {
  if (runtimeStore) {
    if (getStateBackendMode() === "postgres") {
      if (!refreshPromise) {
        refreshPromise = refreshRuntimeStoreFromPostgresIfNeeded().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
    }
    return runtimeStore;
  }
  if (!initPromise) {
    initPromise = initializeRuntimeStore().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function persistRuntimeStore(store?: MemoryStore): Promise<void> {
  if (getStateBackendMode() !== "postgres") return;
  const instance = store ?? (await getRuntimeStore());
  const state = instance.snapshotState();
  persistQueue = persistQueue.then(async () => {
    runtimeStoreUpdatedAtMs = await saveStateToPostgres(state);
  });
  await persistQueue;
}

export async function clearRuntimeStateForTests() {
  runtimeStore = null;
  runtimeStoreUpdatedAtMs = null;
  initPromise = null;
  setLegacyStore(new MemoryStore());
  if (getStateBackendMode() === "postgres") {
    await ensureRuntimeStateTable();
    const db = getDb();
    await db.delete(appRuntimeState).where(eq(appRuntimeState.id, RUNTIME_STATE_ROW_ID));
  }
}

export function getRuntimeBackendInfo() {
  return {
    backend: getStateBackendMode(),
    timestamp: nowIso()
  };
}
