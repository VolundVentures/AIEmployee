import Anthropic from "@anthropic-ai/sdk";

/**
 * Tool definitions for Claude API tool_use.
 * These are the capabilities available to the AI employee.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_web",
    description:
      "Search the web for information. Use this for research tasks, finding current data, competitor analysis, or answering questions that require up-to-date information.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "save_memory",
    description:
      "Save an important fact, preference, or insight to long-term memory. Use this to remember things about the company, user preferences, task outcomes, or learned information that should persist across conversations.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The information to remember",
        },
        type: {
          type: "string",
          enum: ["fact", "preference", "task_outcome", "learned_skill"],
          description: "The type of memory entry",
        },
      },
      required: ["content", "type"],
    },
  },
  {
    name: "recall_memory",
    description:
      "Search long-term memory for relevant information. Use this to recall facts about the company, user preferences, past task outcomes, or previously learned information.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "What to search for in memory",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task to track work. Use this when the user assigns work that should be tracked, has multiple steps, or needs follow-up.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Short task title",
        },
        description: {
          type: "string",
          description: "Detailed task description",
        },
        autonomy: {
          type: "string",
          enum: ["supervised", "semi_auto", "auto"],
          description:
            "Autonomy level: supervised (ask before every action), semi_auto (execute and report), auto (execute silently)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update a task's status or result. Use this to mark tasks as in progress, completed, or failed, and to record outcomes.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: {
          type: "string",
          description: "The task ID to update",
        },
        status: {
          type: "string",
          enum: ["in_progress", "needs_approval", "completed", "failed"],
          description: "New status for the task",
        },
        result: {
          type: "string",
          description: "Task result or outcome description",
        },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List current tasks, optionally filtered by status. Use this to check what work is pending, in progress, or completed.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "needs_approval", "completed", "failed"],
          description: "Filter by status (optional, omit for all tasks)",
        },
      },
      required: [],
    },
  },
  {
    name: "request_approval",
    description:
      "Request approval from the user before proceeding with an action. Use this in supervised mode or when about to take a significant action.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Description of the action you want to take",
        },
        reason: {
          type: "string",
          description: "Why this action is needed",
        },
      },
      required: ["action"],
    },
  },
];
