import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Task } from "./types.js";

const TASKS_FILE = "./journeyman_tasks.json";

function loadTasks(): Task[] {
  if (existsSync(TASKS_FILE)) {
    try {
      return JSON.parse(readFileSync(TASKS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveTasks(tasks: Task[]) {
  writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

let tasks = loadTasks();

export class TaskManager {
  private employeeId: string;

  constructor(employeeId: string) {
    this.employeeId = employeeId;
  }

  async create(
    title: string,
    description?: string,
    autonomy: Task["autonomy"] = "semi_auto"
  ): Promise<Task> {
    const task: Task = {
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      title,
      description,
      status: "pending",
      autonomy,
      createdAt: new Date(),
    };

    tasks.push(task);
    saveTasks(tasks);
    console.log(`[Tasks] Created: "${title}" (${autonomy})`);
    return task;
  }

  async update(
    taskId: string,
    status: Task["status"],
    result?: string
  ): Promise<Task | null> {
    const task = tasks.find((t) => t.id === taskId && t.employeeId === this.employeeId);
    if (!task) return null;

    task.status = status;
    if (result) task.result = result;
    if (status === "completed" || status === "failed") {
      task.completedAt = new Date();
    }

    saveTasks(tasks);
    console.log(`[Tasks] Updated "${task.title}" → ${status}`);
    return task;
  }

  async list(status?: Task["status"]): Promise<Task[]> {
    let results = tasks.filter((t) => t.employeeId === this.employeeId);
    if (status) {
      results = results.filter((t) => t.status === status);
    }
    return results;
  }

  async get(taskId: string): Promise<Task | null> {
    return tasks.find((t) => t.id === taskId && t.employeeId === this.employeeId) || null;
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
}
