// Postgres/Drizzle client baseline for future adapter work.
// The MVP runtime currently uses an in-memory store for portability and zero-setup demos.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | null = null;

export function getPgPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPgPool());
}

export async function closeDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
