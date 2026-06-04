import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

export function assertPortalToken(request: FastifyRequest): void {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token !== config.PORTAL_BEARER_TOKEN) {
    throw new Error("UNAUTHORIZED: Invalid portal bearer token.");
  }
}
