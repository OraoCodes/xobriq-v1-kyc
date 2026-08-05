export type EntityType = "person" | "device" | "phone" | "bank_account" | "kra_pin";

export interface EntityRef {
  id: string;
  isNew: boolean;
}

/**
 * The consortium graph. Every raw identifier crossing into this port is
 * tokenised (HMAC-SHA256 + a pepper) before it becomes a key_hash — see
 * infrastructure/security/tokenise.ts — so no adapter, cache, or log line
 * downstream of getOrCreateEntity ever sees raw PII again.
 */
export interface EntityGraph {
  getOrCreateEntity(type: EntityType, rawValue: string): Promise<EntityRef>;
  linkEntities(fromEntityId: string, toEntityId: string, relation: string): Promise<void>;
  /**
   * Count of DISTINCT other entities linked to `entityId` via `relation`
   * within `windowDays`, excluding `excludeEntityId`. Call this BEFORE
   * linking the current request's own entities — the count must reflect
   * prior history, not the request being decided.
   */
  linkedEntityCount(entityId: string, relation: string, excludeEntityId: string, windowDays: number): Promise<number>;
  /** True if any of the given entities, or anything within 2 hops, is flagged. */
  isAnyEntityFlagged(entityIds: readonly string[]): Promise<boolean>;
  countDecisionsForEntity(entityId: string): Promise<number>;
}
