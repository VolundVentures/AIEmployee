import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@journeyman/shared";
import type { ModelTier } from "@journeyman/shared";
import { ModelRouter } from "./router.js";
import { AGENT_TOOLS } from "./tools.js";
import { buildSystemPrompt, JOURNEYMAN_EMPLOYEE } from "./personas.js";
import type { Persona } from "./personas.js";
import { MemoryStore } from "../memory/store.js";
import { TaskManager } from "../tasks/manager.js";
import { SkillRegistry } from "../skills/registry.js";
import { SkillLoader } from "../skills/loader.js";
import { webSearch } from "./web-search.js";
import { AutonomyController } from "../autonomy/controller.js";

type Message = Anthropic.MessageParam;

export interface EngineResult {
  response: string;
  model: string;
  tier: ModelTier;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

/**
 * The agent engine: takes a user message, routes it to the right model,
 * runs the tool-use loop, and returns a response.
 */
export class AgentEngine {
  private anthropic: Anthropic;
  private router: ModelRouter;
  private conversations: Map<string, Message[]> = new Map();
  private persona: Persona;
  private memory: MemoryStore;
  private tasks: TaskManager;
  private skillRegistry: SkillRegistry;
  private skillLoader: SkillLoader;
  private autonomy: AutonomyController;
  private defaultAutonomy: "supervised" | "semi_auto" | "auto" = "semi_auto";

  constructor(apiKey?: string, persona?: Persona, employeeId?: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.router = new ModelRouter(apiKey);
    this.persona = persona || JOURNEYMAN_EMPLOYEE;

    const resolvedEmployeeId = employeeId || process.env.EMPLOYEE_ID || "atlas-001";
    this.memory = new MemoryStore(resolvedEmployeeId);
    this.tasks = new TaskManager(resolvedEmployeeId);
    this.skillRegistry = new SkillRegistry();
    this.skillLoader = new SkillLoader(this.skillRegistry);
    this.autonomy = new AutonomyController();
  }

  async processMessage(chatId: string, userMessage: string, forceModel?: ModelTier): Promise<EngineResult> {
    // Get or create conversation history
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    const history = this.conversations.get(chatId)!;

    // Add user message
    history.push({ role: "user", content: userMessage });

    // Route to appropriate model
    const routing = await this.router.route(userMessage, forceModel);
    console.log(`[AgentEngine] Routing: ${routing.reason}`);

    // Build system prompt with memory context
    const memoryContext = await this.memory.getContextString();
    const systemPrompt = buildSystemPrompt(this.persona, memoryContext || undefined);

    // Keep last 20 messages for context
    const recentHistory = history.slice(-20);
    const modelConfig = MODELS[routing.tier];

    let totalIn = 0;
    let totalOut = 0;

    // Agentic loop: keep calling Claude until we get a final text response (no more tool calls)
    let messages: Message[] = [...recentHistory];
    let finalText = "";
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      let response: Anthropic.Message;
      try {
        response = await this.anthropic.messages.create({
          model: routing.model,
          max_tokens: modelConfig.maxTokens,
          system: systemPrompt,
          tools: [...AGENT_TOOLS, ...this.skillLoader.getToolDefinitions()],
          messages,
        });
      } catch (err) {
        console.error(`[AgentEngine] API call failed on iteration ${i + 1}:`, err);
        finalText = "I'm having trouble connecting to my AI backend right now. Please try again in a moment.";
        break;
      }

      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;

      // Collect text and tool_use blocks
      const textParts: string[] = [];
      const toolUses: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      // If no tool calls, we're done
      if (toolUses.length === 0) {
        finalText = textParts.join("\n");
        break;
      }

      // Add assistant's response (with tool_use blocks) to messages
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call with autonomy checks
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        console.log(`[AgentEngine] Tool call: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        // Check autonomy before executing
        const beforeAction = this.autonomy.beforeAction(
          this.defaultAutonomy,
          toolUse.name,
          `${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 100)})`
        );

        let result: string;
        if (beforeAction.type === "request_approval") {
          result = beforeAction.message;
        } else {
          result = await this.executeTool(toolUse.name, toolUse.input as Record<string, unknown>);

          // Check if we should report the result
          const afterAction = this.autonomy.afterAction(this.defaultAutonomy, toolUse.name, result);
          if (afterAction.type === "report") {
            console.log(`[AgentEngine] Autonomy report: ${afterAction.message.slice(0, 100)}`);
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add tool results to messages
      messages.push({ role: "user", content: toolResults });

      // If there was also text in the response, prepend it
      if (textParts.length > 0) {
        finalText = textParts.join("\n") + "\n";
      }
    }

    // Warn if the loop hit the max without a final response
    if (!finalText) {
      console.warn(`[AgentEngine] Hit max iterations (${maxIterations}) without final response`);
      finalText = "I was working on your request but it required more steps than I could complete. Could you try breaking it into smaller parts?";
    }

    // Update conversation history with final response
    history.push({ role: "assistant", content: finalText });

    // Calculate cost before saving
    const cost =
      (totalIn / 1_000_000) * modelConfig.inputCostPer1M +
      (totalOut / 1_000_000) * modelConfig.outputCostPer1M;

    // Save conversation to memory store
    await this.memory.saveConversation(chatId, "user", userMessage);
    await this.memory.saveConversation(chatId, "assistant", finalText, routing.tier, totalIn + totalOut, cost);

    console.log(
      `[AgentEngine] Model: ${routing.tier} | Tokens: ${totalIn}in/${totalOut}out | Cost: $${cost.toFixed(6)}`
    );

    return {
      response: finalText,
      model: routing.model,
      tier: routing.tier,
      tokensIn: totalIn,
      tokensOut: totalOut,
      cost,
    };
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case "search_web": {
          const query = input.query as string;
          return await webSearch(query);
        }

        case "save_memory": {
          const content = input.content as string;
          const type = input.type as "fact" | "preference" | "task_outcome" | "learned_skill";
          await this.memory.saveMemory(content, type);
          return `Saved to long-term memory (${type}): "${content}"`;
        }

        case "recall_memory": {
          const query = input.query as string;
          const results = await this.memory.searchMemory(query);
          if (results.length === 0) {
            return "No memories found matching that query.";
          }
          return results.map((m) => `[${m.type}] ${m.content}`).join("\n");
        }

        case "create_task": {
          const title = input.title as string;
          const description = input.description as string | undefined;
          const autonomy = (input.autonomy as "supervised" | "semi_auto" | "auto") || "semi_auto";
          const task = await this.tasks.create(title, description, autonomy);
          return `Task created: "${task.title}" (ID: ${task.id}, autonomy: ${task.autonomy})`;
        }

        case "update_task": {
          const taskId = input.task_id as string;
          const status = input.status as "in_progress" | "needs_approval" | "completed" | "failed";
          const result = input.result as string | undefined;
          const task = await this.tasks.update(taskId, status, result);
          if (!task) return `Task ${taskId} not found.`;
          return `Task "${task.title}" updated to ${task.status}${result ? `: ${result}` : ""}`;
        }

        case "list_tasks": {
          const status = input.status as string | undefined;
          const taskList = await this.tasks.list(status as any);
          return this.tasks.formatTaskList(taskList);
        }

        case "request_approval": {
          const action = input.action as string;
          const reason = input.reason as string | undefined;
          return `[Approval requested] Action: ${action}${reason ? ` | Reason: ${reason}` : ""}. Waiting for user response.`;
        }

        case "find_skill": {
          const query = input.query as string;
          const results = this.skillRegistry.search(query);
          if (results.length === 0) {
            return `No skills found matching "${query}". Available skills:\n${this.skillRegistry.formatList()}`;
          }
          return `Found ${results.length} skill(s):\n` +
            results.map((s) => `- *${s.name}*: ${s.description} (use tool: ${s.handler})`).join("\n");
        }

        case "list_skills": {
          return `Installed skills:\n${this.skillRegistry.formatList()}`;
        }

        default: {
          // Check if it's a skill tool
          if (this.skillLoader.isSkillTool(name)) {
            return await this.skillLoader.execute(name, input);
          }
          return `Unknown tool: ${name}`;
        }
      }
    } catch (err) {
      console.error(`[AgentEngine] Tool error (${name}):`, err);
      return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  getMemory(): MemoryStore {
    return this.memory;
  }

  getTasks(): TaskManager {
    return this.tasks;
  }

  clearHistory(chatId: string) {
    this.conversations.delete(chatId);
  }
}
