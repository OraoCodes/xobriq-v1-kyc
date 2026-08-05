import { randomUUID, createHash } from "node:crypto";
import type { DecisionAction, FeedbackRequest } from "@xobriq/shared";
import type {
  DecisionRepository,
  DecisionRecord,
  IdempotencyRecord,
  ListDecisionsOptions,
  ListDecisionsResult,
  DecisionStats,
} from "../../src/domain/ports/decision-repository.js";
import type { AuditLog, AuditAppendResult, AuditLogEntry } from "../../src/domain/ports/audit-log.js";
import type { EntityGraph, EntityRef, EntityType } from "../../src/domain/ports/entity-graph.js";
import type { CaseStore, CaseRecord, CaseStatus } from "../../src/domain/ports/case-store.js";
import type { ApiKeyStore, ApiKeyRecord, ApiKeyMode, NewApiKey } from "../../src/domain/ports/api-key-store.js";
import type { FeedbackStore } from "../../src/domain/ports/feedback-store.js";
import type { OperatorStore, OperatorRecord, NewOperator } from "../../src/domain/ports/operator-store.js";
import type { SessionStore, SessionRecord, NewSession } from "../../src/domain/ports/session-store.js";
import type { CustomerStore, CustomerRecord } from "../../src/domain/ports/customer-store.js";
import { tokenise } from "../../src/infrastructure/security/tokenise.js";
import { hashApiKey } from "../../src/infrastructure/security/api-key.js";
import { hashPassword } from "../../src/infrastructure/security/password.js";

const TEST_PEPPER = "test-pepper-not-a-real-secret";

interface Link {
  from: string;
  to: string;
  relation: string;
  createdAt: number;
}

interface PendingAuditRow {
  id: string;
  decisionId: string;
  payload: Record<string, unknown>;
  lastError: string;
}

/**
 * One in-memory "database" implementing every persistence port against
 * shared state — DB-free, fast, and it makes cross-port facts (e.g. "how
 * many decisions has this entity had") consistent for free, the same way a
 * real Postgres instance would. Seeding helpers below give tests control
 * over prior graph state and API keys without touching Supabase.
 */
export class InMemoryPersistence
  implements DecisionRepository, AuditLog, EntityGraph, CaseStore, ApiKeyStore, FeedbackStore, OperatorStore, SessionStore, CustomerStore
{
  private entities = new Map<string, { id: string; type: EntityType; keyHash: string }>();
  private links: Link[] = [];
  private flagged = new Set<string>();
  private decisions = new Map<string, DecisionRecord>();
  private idempotency = new Map<string, IdempotencyRecord>();
  private cases = new Map<string, CaseRecord>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private feedback: Array<{ id: string; decisionId: string; customerId: string; feedback: FeedbackRequest }> = [];
  private auditEntries: Array<AuditLogEntry & { decisionId: string }> = [];
  private auditSeq = 0;
  private lastAuditHash = "";
  private operators = new Map<string, OperatorRecord>();
  private sessions = new Map<string, SessionRecord>(); // keyed by tokenHash
  private customers = new Map<string, CustomerRecord>();
  readonly pendingAudit: PendingAuditRow[] = [];

  forceAuditFailure = false;

  // ---- EntityGraph ----

  async getOrCreateEntity(type: EntityType, rawValue: string): Promise<EntityRef> {
    const keyHash = tokenise(rawValue, TEST_PEPPER);
    for (const e of this.entities.values()) {
      if (e.type === type && e.keyHash === keyHash) return { id: e.id, isNew: false };
    }
    const id = `ent_${this.entities.size + 1}`;
    this.entities.set(id, { id, type, keyHash });
    return { id, isNew: true };
  }

  async linkEntities(fromEntityId: string, toEntityId: string, relation: string): Promise<void> {
    const exists = this.links.some((l) => l.from === fromEntityId && l.to === toEntityId && l.relation === relation);
    if (!exists) this.links.push({ from: fromEntityId, to: toEntityId, relation, createdAt: Date.now() });
  }

  async linkedEntityCount(entityId: string, relation: string, excludeEntityId: string, windowDays: number): Promise<number> {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const fromIds = new Set(
      this.links
        .filter((l) => l.to === entityId && l.relation === relation && l.from !== excludeEntityId && l.createdAt >= cutoff)
        .map((l) => l.from),
    );
    return fromIds.size;
  }

  async isAnyEntityFlagged(entityIds: readonly string[]): Promise<boolean> {
    // 2-hop BFS from the seed set, mirroring graph_entity_flagged's SQL semantics.
    let frontier = new Set(entityIds);
    const visited = new Set(entityIds);
    for (let hop = 0; hop < 2; hop++) {
      const next = new Set<string>();
      for (const l of this.links) {
        if (frontier.has(l.from) && !visited.has(l.to)) next.add(l.to);
        if (frontier.has(l.to) && !visited.has(l.from)) next.add(l.from);
      }
      for (const id of next) visited.add(id);
      frontier = next;
    }
    for (const id of visited) if (this.flagged.has(id)) return true;
    return false;
  }

  async countDecisionsForEntity(entityId: string): Promise<number> {
    let count = 0;
    for (const d of this.decisions.values()) if (d.entityId === entityId) count++;
    return count;
  }

  // ---- DecisionRepository ----

  async save(record: DecisionRecord): Promise<void> {
    this.decisions.set(record.id, record);
  }

  async findById(id: string, customerId: string): Promise<DecisionRecord | null> {
    const record = this.decisions.get(id);
    return record && record.customerId === customerId ? record : null;
  }

  async listByCustomer(customerId: string, options: ListDecisionsOptions): Promise<ListDecisionsResult> {
    let items = [...this.decisions.values()].filter((d) => d.customerId === customerId);
    if (options.initiatedBy) items = items.filter((d) => d.initiatedBy === options.initiatedBy);
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const total = items.length;
    return { items: items.slice(options.offset, options.offset + options.limit), total };
  }

  async statsForCustomer(customerId: string): Promise<DecisionStats> {
    const byAction: Record<DecisionAction, number> = { ALLOW: 0, BLOCK: 0, REVIEW: 0, STEP_UP: 0 };
    let total = 0;
    for (const d of this.decisions.values()) {
      if (d.customerId !== customerId) continue;
      byAction[d.recommendedAction]++;
      total++;
    }
    return { total, byAction };
  }

  async findIdempotencyRecord(customerId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(`${customerId}:${idempotencyKey}`) ?? null;
  }

  async reserveIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    this.idempotency.set(`${customerId}:${idempotencyKey}`, { requestHash, responseStatus, responseBody });
  }

  // ---- AuditLog ----

  async append(decisionId: string, redactedPayload: Record<string, unknown>): Promise<AuditAppendResult> {
    const auditId = randomUUID();
    if (this.forceAuditFailure) {
      this.pendingAudit.push({ id: auditId, decisionId, payload: redactedPayload, lastError: "simulated audit RPC failure" });
      return { auditId, outcome: "buffered" };
    }

    this.auditSeq += 1;
    const prevHash = this.lastAuditHash;
    const hash = createHash("sha256").update(`${prevHash}${this.auditSeq}${decisionId}${JSON.stringify(redactedPayload)}`).digest("hex");
    this.lastAuditHash = hash;
    this.auditEntries.push({
      id: auditId,
      decisionId,
      seq: this.auditSeq,
      payload: redactedPayload,
      prevHash,
      hash,
      createdAt: new Date().toISOString(),
    });
    return { auditId, outcome: "recorded" };
  }

  async findByDecisionId(decisionId: string): Promise<AuditLogEntry[]> {
    return this.auditEntries
      .filter((e) => e.decisionId === decisionId)
      .map(({ decisionId: _decisionId, ...entry }) => entry)
      .sort((a, b) => a.seq - b.seq);
  }

  // ---- CaseStore ----

  async createForReview(decisionId: string, entityId: string, riskScore: number, customerId: string): Promise<string> {
    const id = randomUUID();
    this.cases.set(id, {
      id,
      customerId,
      decisionId,
      entityId,
      status: "open",
      riskScore,
      resolution: null,
      reasonCode: null,
      resolvedBy: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });
    return id;
  }

  async findCaseById(id: string, customerId: string): Promise<CaseRecord | null> {
    const record = this.cases.get(id);
    return record && record.customerId === customerId ? record : null;
  }

  async listCasesByCustomer(customerId: string, status?: CaseStatus): Promise<CaseRecord[]> {
    let items = [...this.cases.values()].filter((c) => c.customerId === customerId);
    if (status) items = items.filter((c) => c.status === status);
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async resolve(id: string, customerId: string, resolution: string, reasonCode: string, resolvedBy: string): Promise<CaseRecord> {
    const existing = this.cases.get(id);
    if (!existing || existing.customerId !== customerId) throw new Error(`case ${id} not found`);
    const updated: CaseRecord = {
      ...existing,
      status: "resolved",
      resolution,
      reasonCode,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    };
    this.cases.set(id, updated);
    return updated;
  }

  // ---- ApiKeyStore ----

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.apiKeys.get(keyHash) ?? null;
  }

  async listKeysByCustomer(customerId: string): Promise<ApiKeyRecord[]> {
    return [...this.apiKeys.values()].filter((k) => k.customerId === customerId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createKey(key: NewApiKey): Promise<void> {
    this.apiKeys.set(key.keyHash, {
      id: key.id,
      mode: key.mode,
      customerId: key.customerId,
      scopes: key.scopes,
      isActive: true,
      keyPrefix: key.keyPrefix,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
  }

  async deactivate(id: string, customerId: string): Promise<void> {
    for (const record of this.apiKeys.values()) {
      if (record.id === id && record.customerId === customerId) record.isActive = false;
    }
  }

  /** Seed a raw test key (e.g. "sk_test_abc123") so auth can resolve it. */
  seedApiKey(rawKey: string, record: { id: string; mode: ApiKeyMode; customerId: string; scopes: readonly string[]; isActive?: boolean }): void {
    this.apiKeys.set(hashApiKey(rawKey), {
      ...record,
      isActive: record.isActive ?? true,
      keyPrefix: rawKey.slice(0, 16),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
  }

  // ---- OperatorStore ----

  async findByEmail(email: string): Promise<OperatorRecord | null> {
    return this.operators.get(email.toLowerCase()) ?? null;
  }

  async createOperator(operator: NewOperator): Promise<void> {
    this.operators.set(operator.email.toLowerCase(), { ...operator, isActive: true });
  }

  // ---- SessionStore ----

  async createSession(session: NewSession): Promise<void> {
    this.sessions.set(session.tokenHash, {
      id: session.id,
      customerId: session.customerId,
      userEmail: session.userEmail,
      role: this.operators.get(session.userEmail.toLowerCase())?.role ?? "admin",
      expiresAt: session.expiresAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    for (const [hash, record] of this.sessions.entries()) {
      if (record.id === id) this.sessions.delete(hash);
    }
  }

  // ---- CustomerStore ----

  async findCustomerById(id: string): Promise<CustomerRecord | null> {
    return this.customers.get(id) ?? null;
  }

  /** Seed a customer record so login responses can include an org name. */
  seedCustomer(record: CustomerRecord): void {
    this.customers.set(record.id, record);
  }

  // ---- FeedbackStore ----

  async create(decisionId: string, customerId: string, feedback: FeedbackRequest): Promise<string> {
    const id = randomUUID();
    this.feedback.push({ id, decisionId, customerId, feedback });
    return id;
  }

  // ---- test seeding helpers ----

  /** Seed an operator with a real password hash so login tests exercise the real verify path. */
  async seedOperator(email: string, password: string, options: { customerId: string; role?: OperatorRecord["role"] }): Promise<void> {
    await this.createOperator({
      id: `op_${this.operators.size + 1}`,
      customerId: options.customerId,
      email,
      passwordHash: await hashPassword(password),
      role: options.role ?? "admin",
    });
  }

  /** Pre-flag an entity (by its raw value) as confirmed fraud, before a decision runs. */
  async seedFlaggedEntity(type: EntityType, rawValue: string): Promise<void> {
    const entity = await this.getOrCreateEntity(type, rawValue);
    this.flagged.add(entity.id);
  }

  /** Pre-link `count` distinct synthetic person entities to a device, before a decision runs. */
  async seedDeviceSharedBy(deviceFingerprint: string, count: number): Promise<void> {
    const device = await this.getOrCreateEntity("device", deviceFingerprint);
    for (let i = 0; i < count; i++) {
      const person = await this.getOrCreateEntity("person", `seed-shared-person-${deviceFingerprint}-${i}`);
      await this.linkEntities(person.id, device.id, "used_device");
    }
  }
}
