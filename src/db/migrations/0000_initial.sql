CREATE TABLE IF NOT EXISTS app_runtime_state (
  id varchar(64) PRIMARY KEY,
  state_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
