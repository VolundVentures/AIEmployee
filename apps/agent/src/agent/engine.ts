import Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "../memory/store.js";
import { TRADING_TOOLS, executeTradingTool, isTradingTool } from "../trading/tools.js";

// ─── Model Config (inlined — no external package needed) ────────

type ModelTier = "haiku" | "sonnet" | "opus";

const MODELS = {
  haiku: {
    id: "claude-haiku-4-5-20251001",
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    maxTokens: 4096,
  },
  sonnet: {
    id: "claude-sonnet-4-6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    maxTokens: 8192,
  },
  opus: {
    id: "claude-opus-4-6",
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    maxTokens: 16384,
  },
} as const;

// ─── Types ──────────────────────────────────────────────────────

export interface Persona {
  name: string;
  role: string;
  systemPrompt: string;
}

export interface EngineResult {
  response: string;
  model: string;
  tier: ModelTier;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

// ─── Engine ─────────────────────────────────────────────────────

/**
 * Simplified agent engine for Goldie.
 * Handles: Claude API calls, tool execution (trading tools only), memory.
 * Uses Haiku for on-demand WhatsApp messages (cheap, fast).
 */
export class AgentEngine {
  private anthropic: Anthropic;
  private conversations: Map<string, Anthropic.MessageParam[]> = new Map();
  private persona: Persona;
  private memory: MemoryStore;
  private memoryEnabled: boolean;

  constructor(apiKey?: string, persona?: Persona, employeeId?: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.persona = persona || { name: "Goldie", role: "XAUUSD Trader", systemPrompt: "You are a gold trading assistant." };

    const resolvedId = employeeId || process.env.EMPLOYEE_ID || "";
    this.memoryEnabled = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedId);
    this.memory = new MemoryStore(resolvedId);
    if (!this.memoryEnabled) {
      console.warn("[Engine] No valid EMPLOYEE_ID (UUID) — memory persistence disabled.");
    }
  }

  async processMessage(chatId: string, userMessage: string): Promise<EngineResult> {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    const history = this.conversations.get(chatId)!;
    history.push({ role: "user", content: userMessage });

    // Always use Haiku for on-demand messages (cheap + fast)
    const tier: ModelTier = "haiku";
    const modelConfig = MODELS[tier];

    // Build system prompt with memory context
    const memoryContext = this.memoryEnabled ? await this.memory.getContextString() : "";
    const systemPrompt = memoryContext
      ? `${this.persona.systemPrompt}\n\n${memoryContext}`
      : this.persona.systemPrompt;

    const recentHistory = history.slice(-20);
    let totalIn = 0;
    let totalOut = 0;

    // Agentic loop: keep calling Claude until we get a final text response
    let messages: Anthropic.MessageParam[] = [...recentHistory];
    let finalText = "";
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      let response: Anthropic.Message;
      try {
        response = await this.anthropic.messages.create({
          model: modelConfig.id,
          max_tokens: modelConfig.maxTokens,
          system: systemPrompt,
          tools: TRADING_TOOLS,
          messages,
        });
      } catch (err) {
        console.error(`[Engine] API call failed on iteration ${i + 1}:`, err);
        finalText = "I'm having trouble connecting right now. Please try again.";
        break;
      }

      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;

      const textParts: string[] = [];
      const toolUses: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      if (toolUses.length === 0) {
        finalText = textParts.join("\n");
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        console.log(`[Engine] Tool: ${toolUse.name}`);
        let result: string;
        if (isTradingTool(toolUse.name)) {
          result = await executeTradingTool(toolUse.name, toolUse.input as Record<string, unknown>);
        } else {
          result = `Unknown tool: ${toolUse.name}`;
        }
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }

      messages.push({ role: "user", content: toolResults });
      if (textParts.length > 0) {
        finalText = textParts.join("\n") + "\n";
      }
    }

    if (!finalText) {
      finalText = "I was working on your request but it required more steps than I could complete.";
    }

    history.push({ role: "assistant", content: finalText });

    const cost =
      (totalIn / 1_000_000) * modelConfig.inputCostPer1M +
      (totalOut / 1_000_000) * modelConfig.outputCostPer1M;

    if (this.memoryEnabled) {
      try {
        await this.memory.saveConversation(chatId, "user", userMessage);
        await this.memory.saveConversation(chatId, "assistant", finalText, tier, totalIn + totalOut, cost);
      } catch (err) {
        console.warn("[Engine] Memory save failed (non-fatal):", err instanceof Error ? err.message : err);
      }
    }

    console.log(`[Engine] Haiku | ${totalIn}in/${totalOut}out | $${cost.toFixed(6)}`);

    return { response: finalText, model: modelConfig.id, tier, tokensIn: totalIn, tokensOut: totalOut, cost };
  }

  getMemory(): MemoryStore {
    return this.memory;
  }

  isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }
}
