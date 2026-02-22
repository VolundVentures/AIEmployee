export interface MemoryEntry {
  id: string;
  employeeId: string;
  type: "fact" | "preference" | "task_outcome" | "learned_skill";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ConversationEntry {
  id: string;
  employeeId: string;
  phoneNumber: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  tokensUsed?: number;
  costUsd?: number;
  createdAt: Date;
}
