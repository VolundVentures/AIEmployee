import { getServiceClient } from "@journeyman/db";
import type { Task } from "./types.js";

/**
 * Task manager backed by Supabase.
 * Uses the service role client for direct database access from the agent backend.
 */
export class TaskManager {
  private employeeId: string;
  private supabase: ReturnType<typeof getServiceClient>;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
    this.supabase = getServiceClient();
  }

  async create(
    title: string,
    description?: string,
    autonomy: Task["autonomy"] = "semi_auto"
  ): Promise<Task> {
    const { data, error } = await this.supabase
      .from("tasks")
      .insert({
        employee_id: this.employeeId,
        title,
        description,
        status: "pending",
        autonomy,
      })
      .select()
      .single();

    if (error) {
      console.error("[Tasks] Failed to create:", error.message);
      throw error;
    }

    console.log(`[Tasks] Created: "${title}" (${autonomy})`);
    return this.toTask(data);
  }

  async update(
    taskId: string,
    status: Task["status"],
    result?: string
  ): Promise<Task | null> {
    const updates: Record<string, unknown> = { status };
    if (result) updates.result = result;
    if (status === "completed" || status === "failed") {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("employee_id", this.employeeId)
      .select()
      .single();

    if (error) {
      console.error("[Tasks] Failed to update:", error.message);
      return null;
    }

    console.log(`[Tasks] Updated "${data.title}" → ${status}`);
    return this.toTask(data);
  }

  async list(status?: Task["status"]): Promise<Task[]> {
    let query = this.supabase
      .from("tasks")
      .select()
      .eq("employee_id", this.employeeId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Tasks] Failed to list:", error.message);
      return [];
    }

    return data.map(this.toTask);
  }

  async get(taskId: string): Promise<Task | null> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select()
      .eq("id", taskId)
      .eq("employee_id", this.employeeId)
      .single();

    if (error) return null;
    return this.toTask(data);
  }

  formatTaskList(taskList: Task[]): string {
    if (taskList.length === 0) return "No tasks found.";

    return taskList
      .map((t) => {
        const status = {
          pending: "[ ]",
          in_progress: "[~]",
          needs_approval: "[?]",
          completed: "[x]",
          failed: "[!]",
        }[t.status];
        const age = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 3600000);
        return `${status} ${t.title} (${t.autonomy}, ${age}h ago)${t.result ? `\n    → ${t.result}` : ""}`;
      })
      .join("\n");
  }

  /** Map Supabase row (snake_case) to Task (camelCase) */
  private toTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      title: row.title as string,
      description: row.description as string | undefined,
      status: row.status as Task["status"],
      autonomy: row.autonomy as Task["autonomy"],
      result: row.result as string | undefined,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    };
  }
}
