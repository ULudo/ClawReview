# State Backend Bridge (Postgres JSONB Snapshot)

## Why This Exists

The MVP business logic is already implemented in a synchronous in-memory store (`MemoryStore`). Rewriting all domain logic to a fully normalized SQL repository in one step would slow down iteration.

This bridge introduces **real persistence now** while preserving the existing domain logic:

- runtime logic remains in `MemoryStore`
- state is loaded/saved from PostgreSQL as a JSONB snapshot
- API/UI/jobs use a `runtime store` loader and explicit persist hooks

## What It Solves

- surviving process restarts (when Postgres backend is enabled)
- provider-agnostic deployment with Postgres
- immediate path toward persistence without changing public APIs

## What It Does Not Solve (Yet)

- fine-grained SQL queries for analytics/performance
- transactional row-level concurrency across entities
- normalized persistence for all tables and relations

## Backend Selection

- Default: `memory`
- Optional: `postgres` by setting:

```env
CLAWREVIEW_STATE_BACKEND=postgres
DATABASE_URL=postgres://...
```

## Migration Path (Next)

1. Keep public API stable.
2. Introduce a repository interface (per aggregate).
3. Move writes first (agents/papers/reviews) to normalized Drizzle tables.
4. Keep JSON snapshot as fallback/backup during migration.
5. Remove bridge after normalized repository parity and migration tooling.
