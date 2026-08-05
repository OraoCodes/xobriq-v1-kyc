import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ApiKeyRecord } from "../../../domain/ports/api-key-store.js";
import { AppError } from "../../../shared/errors.js";
import { requireScope, requireAdminSession } from "../auth.js";
import { generateApiKey, hashApiKey, keyPrefixOf } from "../../../infrastructure/security/api-key.js";
import type { AppDeps } from "../app.js";

function toKeyView(key: ApiKeyRecord) {
  return {
    id: key.id,
    mode: key.mode,
    key_prefix: key.keyPrefix,
    is_active: key.isActive,
    created_at: key.createdAt,
    last_used_at: key.lastUsedAt,
  };
}

export function registerKeyRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/v1/keys", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:read");
    const keys = await deps.keyStore.listKeysByCustomer(auth.customerId);
    reply.send({ items: keys.map(toKeyView) });
  });

  // Rotation is deliberately session-only (never via an API key — a key
  // can't be used to replace itself) and admin-only.
  app.post("/v1/keys/:id/rotate", async (request, reply) => {
    const auth = request.auth!;
    requireAdminSession(auth);
    const { id } = request.params as { id: string };

    const existing = (await deps.keyStore.listKeysByCustomer(auth.customerId)).find((k) => k.id === id);
    if (!existing) throw new AppError("NOT_FOUND", "key not found");

    await deps.keyStore.deactivate(existing.id, auth.customerId);

    const rawKey = generateApiKey(existing.mode);
    const newId = randomUUID();
    await deps.keyStore.createKey({
      id: newId,
      customerId: auth.customerId,
      mode: existing.mode,
      keyHash: hashApiKey(rawKey),
      keyPrefix: keyPrefixOf(rawKey),
      scopes: existing.scopes,
    });

    // The only moment the raw secret is ever visible again.
    reply.send({ id: newId, mode: existing.mode, key_prefix: keyPrefixOf(rawKey), secret: rawKey });
  });
}
