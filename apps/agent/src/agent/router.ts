import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@journeyman/shared";
import type { ModelTier, ClassificationResult, RoutingDecision } from "@journeyman/shared";

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|yo|sup)\b/i,
  /^(thanks|thank you|thx)\b/i,
  /^(ok|okay|sure|yes|no|yep|nope)\b/i,
  /^(status|help)\b/i,
];

/**
 * Tiered model router.
 * 1. Regex pre-filter for trivially simple messages
 * 2. Haiku classifier for everything else
 * 3. Routes to Haiku / Sonnet / Opus based on complexity
 */
export class ModelRouter {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async route(message: string, forceModel?: ModelTier): Promise<RoutingDecision> {
    if (forceModel) {
      return {
        model: MODELS[forceModel].id,
        tier: forceModel,
        reason: `Forced to ${forceModel}`,
      };
    }

    // Level 1: Regex pre-filter
    if (SIMPLE_PATTERNS.some((p) => p.test(message.trim()))) {
      return {
        model: MODELS.haiku.id,
        tier: "haiku",
        reason: "Simple pattern match",
      };
    }

    // Level 2: Haiku classifier
    const classification = await this.classify(message);

    const tier = classification.tier;
    return {
      model: MODELS[tier].id,
      tier,
      reason: `Classified as ${tier} (confidence: ${classification.confidence}): ${classification.reasoning}`,
    };
  }

  private async classify(message: string): Promise<ClassificationResult> {
    try {
      const response = await this.anthropic.messages.create({
        model: MODELS.haiku.id,
        max_tokens: 150,
        system: `You are a task complexity classifier. Classify the user message into exactly one tier:
- SIMPLE: Greetings, acknowledgments, yes/no answers, status checks, simple factual lookups
- MODERATE: Writing/drafting, summarization, structured analysis, moderate reasoning, formatting
- COMPLEX: Deep research, multi-step reasoning, strategy, code generation, novel problem-solving

Respond with JSON only: {"tier": "simple"|"moderate"|"complex", "confidence": 0.0-1.0, "reasoning": "brief reason"}`,
        messages: [{ role: "user", content: message }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      return {
        tier: parsed.tier as ModelTier,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch {
      // Default to sonnet on classification failure
      return {
        tier: "sonnet",
        confidence: 0.5,
        reasoning: "Classification failed, defaulting to sonnet",
      };
    }
  }
}
