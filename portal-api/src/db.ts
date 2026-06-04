import { Pool } from "pg";
import { config } from "./config.js";

const normalizedDatabaseUrl = normalizeDatabaseUrl(config.DATABASE_URL);
const connectionUrl = new URL(normalizedDatabaseUrl);
const useSsl =
  connectionUrl.searchParams.get("sslmode") === "require" ||
  connectionUrl.hostname.includes("neon.tech") ||
  connectionUrl.hostname.includes("aws.neon.tech");

export const pool = new Pool({
  connectionString: normalizedDatabaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeDatabaseUrl(value: string) {
  let raw = String(value ?? "").trim();

  const psqlMatch = raw.match(/^psql\s+(['"])(.+)\1$/i);
  if (psqlMatch?.[2]) {
    raw = psqlMatch[2].trim();
  }

  const quoted =
    (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'));
  if (quoted) {
    raw = raw.slice(1, -1).trim();
  }

  return raw;
}
