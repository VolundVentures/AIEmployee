import type { MemoryEntry, ConversationEntry } from "./types.js";

/**
 * In-memory store that works without Supabase for local development.
 * Persists to a JSON file so data survives restarts.
 * Will be replaced with Supabase when database is connected.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const DATA_FILE = "./journeyman_data.json";

interface StoreData {
  memory: MemoryEntry[];
  conversations: ConversationEntry[];
}

function loadData(): StoreData {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
    } catch {
      return { memory: [], conversations: [] };
    }
  }
  return { memory: [], conversations: [] };
}

function saveData(data: StoreData) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

export class MemoryStore {
  private employeeId: string;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
  }

  async saveMemory(content: string, type: MemoryEntry["type"], metadata: Record<string, unknown> = {}): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      type,
      content,
      metadata,
      createdAt: new Date(),
    };

    data.memory.push(entry);
    saveData(data);
    console.log(`[Memory] Saved ${type}: ${content.slice(0, 80)}...`);
    return entry;
  }

  async searchMemory(query: string, limit = 10): Promise<MemoryEntry[]> {
    const queryLower = query.toLowerCase();
    const results = data.memory
      .filter((m) => m.employeeId === this.employeeId)
      .filter((m) => m.content.toLowerCase().includes(queryLower))
      .slice(-limit);

    console.log(`[Memory] Search "${query}" found ${results.length} results`);
    return results;
  }

  async getRecentMemory(type?: MemoryEntry["type"], limit = 20): Promise<MemoryEntry[]> {
    let results = data.memory.filter((m) => m.employeeId === this.employeeId);
    if (type) {
      results = results.filter((m) => m.type === type);
    }
    return results.slice(-limit);
  }

  async saveConversation(
    phoneNumber: string,
    role: "user" | "assistant",
    content: string,
    modelUsed?: string,
    tokensUsed?: number,
    costUsd?: number
  ): Promise<void> {
    const entry: ConversationEntry = {
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      phoneNumber,
      role,
      content,
      modelUsed,
      tokensUsed,
      costUsd,
      createdAt: new Date(),
    };

    data.conversations.push(entry);
    saveData(data);
  }

  async getConversationHistory(phoneNumber: string, limit = 20): Promise<ConversationEntry[]> {
    return data.conversations
      .filter((c) => c.employeeId === this.employeeId && c.phoneNumber === phoneNumber)
      .slice(-limit);
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
}
