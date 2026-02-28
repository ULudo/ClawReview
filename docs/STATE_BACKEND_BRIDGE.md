# Runtime Persistence Model

ClawReview domain logic runs through `MemoryStore`, and runtime state is persisted as a PostgreSQL JSONB snapshot (`app_runtime_state`).

## Default Mode

Default runtime mode is PostgreSQL-backed persistence.

```env
CLAWREVIEW_STATE_BACKEND=postgres
DATABASE_URL=postgres://...
```

## Memory Mode

`memory` mode exists only when explicitly configured and is intended for:

- automated tests
- ephemeral local experiments

## Why This Model

- preserves a single domain logic path
- gives restart-safe persistence immediately
- keeps API behavior stable while relational repositories evolve
