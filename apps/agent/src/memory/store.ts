import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { MemoryEntry, ConversationEntry } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Persistent memory store backed by local JSON files.
 * Stores heartbeat summaries and conversation history so Goldie
 * maintains context across restarts — no database required.
 *
 * Files are stored in data/<employeeId>/ relative to the project root.
 */
export class MemoryStore {
  private employeeId: string;
  private dataDir: string;
  private memoryFile: string;
  private conversationFile: string;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
    // Store data in project root/data/<id>/
    const projectRoot = resolve(__dirname, "../../../../");
    this.dataDir = resolve(projectRoot, "data", employeeId || "default");
    this.memoryFile = resolve(this.dataDir, "memory.json");
    this.conversationFile = resolve(this.dataDir, "conversations.json");

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async saveMemory(content: string, type: MemoryEntry["type"], metadata: Record<string, unknown> = {}): Promise<MemoryEntry> {
    const memories = this.readMemories();

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      type,
      content,
      metadata,
      createdAt: new Date(),
    };

    memories.push(entry);

    // Keep last 200 entries to prevent unbounded growth
    const trimmed = memories.slice(-200);
    this.writeMemories(trimmed);

    console.log(`[Memory] Saved ${type}: ${content.slice(0, 80)}...`);
    return entry;
  }

  async searchMemory(query: string, limit = 10): Promise<MemoryEntry[]> {
    const memories = this.readMemories();
    const lower = query.toLowerCase();
    const results = memories
      .filter(m => m.content.toLowerCase().includes(lower))
      .slice(-limit);

    console.log(`[Memory] Search "${query}" found ${results.length} results`);
    return results;
  }

  async getRecentMemory(type?: MemoryEntry["type"], limit = 20): Promise<MemoryEntry[]> {
    const memories = this.readMemories();
    let filtered = type ? memories.filter(m => m.type === type) : memories;
    return filtered.slice(-limit);
  }

  async saveConversation(
    phoneNumber: string,
    role: "user" | "assistant",
    content: string,
    modelUsed?: string,
    tokensUsed?: number,
    costUsd?: number
  ): Promise<void> {
    const conversations = this.readConversations();

    conversations.push({
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      phoneNumber,
      role,
      content,
      modelUsed,
      tokensUsed,
      costUsd,
      createdAt: new Date(),
    });

    // Keep last 500 conversation entries
    const trimmed = conversations.slice(-500);
    this.writeConversations(trimmed);
  }

  async getConversationHistory(phoneNumber: string, limit = 20): Promise<ConversationEntry[]> {
    const conversations = this.readConversations();
    return conversations
      .filter(c => c.phoneNumber === phoneNumber)
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

  // ─── File I/O ─────────────────────────────────────────────

  private readMemories(): MemoryEntry[] {
    try {
      if (!existsSync(this.memoryFile)) return [];
      const raw = readFileSync(this.memoryFile, "utf-8");
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      return parsed.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt as string),
      })) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  private writeMemories(memories: MemoryEntry[]): void {
    writeFileSync(this.memoryFile, JSON.stringify(memories, null, 2));
  }

  private readConversations(): ConversationEntry[] {
    try {
      if (!existsSync(this.conversationFile)) return [];
      const raw = readFileSync(this.conversationFile, "utf-8");
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      return parsed.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt as string),
      })) as ConversationEntry[];
    } catch {
      return [];
    }
  }

  private writeConversations(conversations: ConversationEntry[]): void {
    writeFileSync(this.conversationFile, JSON.stringify(conversations, null, 2));
  }
}
