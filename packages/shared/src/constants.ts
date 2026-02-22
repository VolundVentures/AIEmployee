/** Model configuration and pricing constants */

export const MODELS = {
  haiku: {
    id: "claude-haiku-4-5-20251001",
    tier: "haiku" as const,
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    maxTokens: 4096,
    description: "Fast, simple tasks",
  },
  sonnet: {
    id: "claude-sonnet-4-6-20250514",
    tier: "sonnet" as const,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    maxTokens: 8192,
    description: "Balanced, moderate tasks",
  },
  opus: {
    id: "claude-opus-4-6-20250514",
    tier: "opus" as const,
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    maxTokens: 16384,
    description: "Complex reasoning and research",
  },
} as const;

export const PRICING_TIERS = {
  intern: {
    name: "Intern",
    monthlyPrice: 0,
    messagesPerMonth: 100,
    allowedModels: ["haiku"] as const,
    autonomyLevels: ["supervised"] as const,
  },
  junior: {
    name: "Junior",
    monthlyPrice: 49,
    messagesPerMonth: 1000,
    allowedModels: ["haiku", "sonnet"] as const,
    autonomyLevels: ["supervised", "semi_auto"] as const,
  },
  senior: {
    name: "Senior",
    monthlyPrice: 149,
    messagesPerMonth: 5000,
    allowedModels: ["haiku", "sonnet", "opus"] as const,
    autonomyLevels: ["supervised", "semi_auto", "auto"] as const,
  },
  lead: {
    name: "Lead",
    monthlyPrice: 299,
    messagesPerMonth: 15000,
    allowedModels: ["haiku", "sonnet", "opus"] as const,
    autonomyLevels: ["supervised", "semi_auto", "auto"] as const,
  },
} as const;

export const AUTONOMY_DESCRIPTIONS = {
  supervised: "Checks in before every major action",
  semi_auto: "Works independently, reports what it did",
  auto: "Executes silently, delivers results only",
} as const;
