import type { FastifyInstance } from "fastify";
import { requireScope } from "../auth.js";
import type { AppDeps } from "../app.js";

export function registerStatsRoute(app: FastifyInstance, deps: AppDeps): void {
  app.get("/v1/stats", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:read");
    const stats = await deps.decisions.statsForCustomer(auth.customerId);
    reply.send({ total: stats.total, by_action: stats.byAction });
  });
}
