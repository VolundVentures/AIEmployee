/** Core domain types for Journeyman */

export interface Company {
  id: string;
  userId: string;
  name: string;
  industry?: string;
  context: Record<string, unknown>;
  createdAt: Date;
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  role: string;
  personaPrompt?: string;
  modelPreference: ModelPreference;
  autonomyDefault: AutonomyLevel;
  skills: string[];
  createdAt: Date;
}

export interface MemoryEntry {
  id: string;
  employeeId: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface Conversation {
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

export interface Task {
  id: string;
  employeeId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  autonomy: AutonomyLevel;
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}

export type ModelTier = "haiku" | "sonnet" | "opus";
export type ModelPreference = ModelTier | "auto";
export type AutonomyLevel = "supervised" | "semi_auto" | "auto";
export type TaskStatus = "pending" | "in_progress" | "needs_approval" | "completed" | "failed";
export type MemoryType = "fact" | "preference" | "task_outcome" | "learned_skill";

export interface ClassificationResult {
  tier: ModelTier;
  confidence: number;
  reasoning: string;
}

export interface RoutingDecision {
  model: string;
  tier: ModelTier;
  reason: string;
}
