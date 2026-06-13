import type { PortalAdminContext } from "../modules/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    portalAdmin?: PortalAdminContext;
  }
}
