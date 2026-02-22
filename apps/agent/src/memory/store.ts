import { getServiceClient } from "@journeyman/db";
import type { MemoryEntry, ConversationEntry } from "./types.js";

/**
 * Persistent memory store backed by Supabase.
 * Uses the service role client for direct database access from the agent backend.
 */
export class MemoryStore {
  private employeeId: string;
  private supabase: ReturnType<typeof getServiceClient>;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
    this.supabase = getServiceClient();
  }

  async saveMemory(content: string, type: MemoryEntry["type"], metadata: Record<string, unknown> = {}): Promise<MemoryEntry> {
    const { data, error } = await this.supabase
      .from("memory")
      .insert({
        employee_id: this.employeeId,
        type,
        content,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error("[Memory] Failed to save:", error.message);
      throw error;
    }

    console.log(`[Memory] Saved ${type}: ${content.slice(0, 80)}...`);
    return this.toMemoryEntry(data);
  }

  async searchMemory(query: string, limit = 10): Promise<MemoryEntry[]> {
    const { data, error } = await this.supabase
      .from("memory")
      .select()
      .eq("employee_id", this.employeeId)
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Memory] Search failed:", error.message);
      return [];
    }

    console.log(`[Memory] Search "${query}" found ${data.length} results`);
    return data.map(this.toMemoryEntry);
  }

  async getRecentMemory(type?: MemoryEntry["type"], limit = 20): Promise<MemoryEntry[]> {
    let query = this.supabase
      .from("memory")
      .select()
      .eq("employee_id", this.employeeId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Memory] Failed to get recent:", error.message);
      return [];
    }

    return data.map(this.toMemoryEntry);
  }

  async saveConversation(
    phoneNumber: string,
    role: "user" | "assistant",
    content: string,
    modelUsed?: string,
    tokensUsed?: number,
    costUsd?: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .insert({
        employee_id: this.employeeId,
        phone_number: phoneNumber,
        role,
        content,
        model_used: modelUsed,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
      });

    if (error) {
      console.error("[Memory] Failed to save conversation:", error.message);
    }
  }

  async getConversationHistory(phoneNumber: string, limit = 20): Promise<ConversationEntry[]> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select()
      .eq("employee_id", this.employeeId)
      .eq("phone_number", phoneNumber)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[Memory] Failed to get history:", error.message);
      return [];
    }

    return data.map(this.toConversationEntry);
  }

  /** Get all memory as context string for the agent */
  async getContextString(): Promise<string> {
    const memories = await this.getRecentMemory(undefined, 50);
    if (memories.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      if (!grouped[m.type]) grouped[m.type] = [];
      grouped[m.type].push(m.content);
    }

    let context = "\n## Long-term Memory\n";
    for (const [type, items] of Object.entries(grouped)) {
      context += `\n### ${type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}s\n`;
      for (const item of items) {
        context += `- ${item}\n`;
      }
    }
    return context;
  }

  /** Map Supabase row (snake_case) to MemoryEntry (camelCase) */
  private toMemoryEntry(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      type: row.type as MemoryEntry["type"],
      content: row.content as string,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: new Date(row.created_at as string),
    };
  }

  /** Map Supabase row (snake_case) to ConversationEntry (camelCase) */
  private toConversationEntry(row: Record<string, unknown>): ConversationEntry {
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      phoneNumber: row.phone_number as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      modelUsed: row.model_used as string | undefined,
      tokensUsed: row.tokens_used as number | undefined,
      costUsd: row.cost_usd as number | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
