import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@journeyman/shared";
import type { ModelTier } from "@journeyman/shared";
import { ModelRouter } from "./router.js";
import { buildSystemPrompt, JOURNEYMAN_EMPLOYEE } from "./personas.js";
import type { Persona } from "./personas.js";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The agent engine: takes a user message, routes it to the right model,
 * and returns a response. Maintains conversation history per chat.
 */
export class AgentEngine {
  private anthropic: Anthropic;
  private router: ModelRouter;
  private conversations: Map<string, ConversationMessage[]> = new Map();
  private persona: Persona;

  constructor(apiKey?: string, persona?: Persona) {
    this.anthropic = new Anthropic({ apiKey });
    this.router = new ModelRouter(apiKey);
    this.persona = persona || JOURNEYMAN_EMPLOYEE;
  }

  async processMessage(
    chatId: string,
    userMessage: string,
    forceModel?: ModelTier
  ): Promise<{ response: string; model: string; tier: ModelTier }> {
    // Get or create conversation history
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    const history = this.conversations.get(chatId)!;

    // Add user message to history
    history.push({ role: "user", content: userMessage });

    // Route to appropriate model
    const routing = await this.router.route(userMessage, forceModel);
    console.log(`[AgentEngine] Routing: ${routing.reason}`);

    // Build messages array (keep last 20 messages for context)
    const recentHistory = history.slice(-20);
    const messages = recentHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Call Claude
    const modelConfig = MODELS[routing.tier];
    const response = await this.anthropic.messages.create({
      model: routing.model,
      max_tokens: modelConfig.maxTokens,
      system: buildSystemPrompt(this.persona),
      messages,
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "[No text response]";

    // Add assistant response to history
    history.push({ role: "assistant", content: responseText });

    // Log token usage
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost =
      (inputTokens / 1_000_000) * modelConfig.inputCostPer1M +
      (outputTokens / 1_000_000) * modelConfig.outputCostPer1M;

    console.log(
      `[AgentEngine] Model: ${routing.tier} | Tokens: ${inputTokens}in/${outputTokens}out | Cost: $${cost.toFixed(6)}`
    );

    return {
      response: responseText,
      model: routing.model,
      tier: routing.tier,
    };
  }

  clearHistory(chatId: string) {
    this.conversations.delete(chatId);
  }
}
