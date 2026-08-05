import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityGraph, EntityRef, EntityType } from "../../../domain/ports/entity-graph.js";
import { tokenise } from "../../security/tokenise.js";

export class SupabaseEntityGraph implements EntityGraph {
  constructor(
    private readonly client: SupabaseClient,
    private readonly pepper: string,
  ) {}

  async getOrCreateEntity(type: EntityType, rawValue: string): Promise<EntityRef> {
    const keyHash = tokenise(rawValue, this.pepper);

    const { data: existing, error: findError } = await this.client
      .from("entities")
      .select("id")
      .eq("entity_type", type)
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (findError) throw new Error(`failed to look up entity: ${findError.message}`);
    if (existing) return { id: existing.id, isNew: false };

    const id = randomUUID();
    const { error: insertError } = await this.client
      .from("entities")
      .insert({ id, entity_type: type, key_hash: keyHash });
    if (insertError) throw new Error(`failed to create entity: ${insertError.message}`);
    return { id, isNew: true };
  }

  async linkEntities(fromEntityId: string, toEntityId: string, relation: string): Promise<void> {
    const { error } = await this.client
      .from("entity_links")
      .upsert(
        { from_entity_id: fromEntityId, to_entity_id: toEntityId, relation },
        { onConflict: "from_entity_id,to_entity_id,relation", ignoreDuplicates: true },
      );
    if (error) throw new Error(`failed to link entities: ${error.message}`);
  }

  async linkedEntityCount(entityId: string, relation: string, excludeEntityId: string, windowDays: number): Promise<number> {
    const { data, error } = await this.client.rpc("graph_linked_entity_count", {
      p_entity_id: entityId,
      p_relation: relation,
      p_window_days: windowDays,
      p_exclude_entity_id: excludeEntityId,
    });
    if (error) throw new Error(`failed to count linked entities: ${error.message}`);
    return data as number;
  }

  async isAnyEntityFlagged(entityIds: readonly string[]): Promise<boolean> {
    if (entityIds.length === 0) return false;
    const { data, error } = await this.client.rpc("graph_entity_flagged", { p_entity_ids: entityIds });
    if (error) throw new Error(`failed to check flagged entities: ${error.message}`);
    return data as boolean;
  }

  async countDecisionsForEntity(entityId: string): Promise<number> {
    const { count, error } = await this.client
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId);
    if (error) throw new Error(`failed to count decisions for entity: ${error.message}`);
    return count ?? 0;
  }
}
