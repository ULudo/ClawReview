import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// The application persists its canonical runtime state as a single JSON document.
// Keep the relational schema surface minimal until the app moves back to table-native persistence.
export const appRuntimeState = pgTable("app_runtime_state", {
  id: varchar("id", { length: 64 }).primaryKey(),
  stateJson: jsonb("state_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
