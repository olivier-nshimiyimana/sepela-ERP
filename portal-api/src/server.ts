import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrateInventoryBreakdown } from "./migrations/inventoryBreakdown.js";
import { migrateOperatorUsernameGlobal } from "./migrations/operatorUsernameGlobal.js";
import { migratePromotions } from "./migrations/promotions.js";
import { bootstrapSql } from "./schema.js";
import { managementRoutes } from "./modules/managementRoutes.js";
import { reportRoutes } from "./modules/reportRoutes.js";
import { operatorRoutes } from "./modules/operatorRoutes.js";
import { syncRoutes } from "./modules/syncRoutes.js";
import { tenantRoutes } from "./modules/tenantRoutes.js";

const app = Fastify({
  logger: true,
});

// Allow DELETE/PATCH with Content-Type: application/json but no body (portal-admin, curl, etc.).
app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
  try {
    if (body === "" || body === undefined || body === null) {
      done(null, undefined);
      return;
    }
    done(null, JSON.parse(body as string));
  } catch (error) {
    done(error as Error, undefined);
  }
});

/** Vite / browser dev (`npm run dev` at localhost:1420, portal-admin at :5173, etc.). */
const LOCAL_DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
];

/** Sepela ERP desktop (Tauri WebView2) origins — not browser tabs. */
const DESKTOP_ORIGIN_PATTERNS = [
  /^https?:\/\/tauri\.localhost(?::\d+)?$/i,
  /^tauri:\/\/localhost$/i,
  /^https?:\/\/asset\.localhost(?::\d+)?$/i,
];

function isAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (LOCAL_DEV_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return true;
  return DESKTOP_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

await app.register(cors, {
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Operator-Session"],
});

app.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : "Internal server error.";
  if (message.includes("Body cannot be empty when content-type is set to 'application/json'")) {
    return reply.status(400).send({
      ok: false,
      error: "Request body is required when Content-Type is application/json, or omit Content-Type for bodyless requests.",
    });
  }
  if (message.startsWith("UNAUTHORIZED:")) {
    return reply.status(401).send({ ok: false, error: message.replace("UNAUTHORIZED:", "").trim() });
  }
  if (message.startsWith("NOT_FOUND:")) {
    return reply.status(404).send({ ok: false, error: message.replace("NOT_FOUND:", "").trim() });
  }
  if (message.startsWith("BAD_REQUEST:")) {
    return reply.status(400).send({ ok: false, error: message.replace("BAD_REQUEST:", "").trim() });
  }
  if (message.startsWith("CONFLICT:")) {
    return reply.status(409).send({ ok: false, error: message.replace("CONFLICT:", "").trim() });
  }
  if (message.startsWith("FORBIDDEN:")) {
    return reply.status(403).send({ ok: false, error: message.replace("FORBIDDEN:", "").trim() });
  }
  reply.status(500).send({ ok: false, error: message });
});

// Root route to handle Render's default root-level platform health checker pings
app.get("/", async (_request, reply) => {
  return reply.status(200).send({
    ok: true,
    service: "sepela-portal-api",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// Explicit API path health check
app.get("/health", async () => ({ ok: true, service: "sepela-portal-api" }));

app.register(tenantRoutes);
app.register(operatorRoutes);
app.register(managementRoutes);
app.register(syncRoutes);
app.register(reportRoutes);

async function start() {
  await pool.query(bootstrapSql);
  await migrateInventoryBreakdown(pool);
  await migrateOperatorUsernameGlobal(pool);
  await migratePromotions(pool);
  await app.listen({
    port: config.PORT,
    host: config.HOST,
  });
}

start().catch((error) => {
  logStartupHint(error);
  app.log.error(error);
  process.exit(1);
});

function logStartupHint(error: unknown) {
  const code = readErrorCode(error);
  if (code !== "ECONNREFUSED") return;

  const databaseUrl = maskDatabaseUrl(config.DATABASE_URL);
  app.log.error(
    [
      "PostgreSQL is not reachable.",
      `DATABASE_URL: ${databaseUrl}`,
      "Start a PostgreSQL server on that host/port, create the database if needed, or change DATABASE_URL to an existing Postgres instance.",
      "Example local target: postgres://postgres:postgres@localhost:5432/sepela_portal",
    ].join(" ")
  );
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

function maskDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return value;
  }
}