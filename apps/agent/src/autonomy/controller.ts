import type { Task } from "../tasks/types.js";

export type AutonomyAction =
  | { type: "proceed" }
  | { type: "request_approval"; message: string }
  | { type: "report"; message: string };

/**
 * Controls what the agent does before/after actions based on the autonomy level.
 */
export class AutonomyController {
  /**
   * Determine what to do before executing a tool call.
   */
  beforeAction(autonomy: Task["autonomy"], toolName: string, description: string): AutonomyAction {
    // Always allow memory and listing operations without approval
    const safeTools = ["recall_memory", "list_tasks", "save_memory"];
    if (safeTools.includes(toolName)) {
      return { type: "proceed" };
    }

    switch (autonomy) {
      case "supervised":
        return {
          type: "request_approval",
          message: `I'd like to: ${description}\n\nShall I proceed? (yes/no)`,
        };

      case "semi_auto":
        return { type: "proceed" };

      case "auto":
        return { type: "proceed" };

      default:
        return { type: "proceed" };
    }
  }

  /**
   * Determine what to report after executing a tool call.
   */
  afterAction(autonomy: Task["autonomy"], toolName: string, result: string): AutonomyAction {
    switch (autonomy) {
      case "supervised":
        return {
          type: "report",
          message: `Done. Here's what happened:\n${result}`,
        };

      case "semi_auto":
        return {
          type: "report",
          message: `Completed: ${result}`,
        };

      case "auto":
        // Auto mode: don't report intermediate steps
        return { type: "proceed" };

      default:
        return { type: "proceed" };
    }
  }
}
