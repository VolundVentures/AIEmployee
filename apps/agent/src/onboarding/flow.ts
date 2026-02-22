import { MemoryStore } from "../memory/store.js";

interface OnboardingState {
  step: "company_name" | "industry" | "description" | "complete";
  companyName?: string;
  industry?: string;
  description?: string;
}

const onboardingStates = new Map<string, OnboardingState>();

/**
 * WhatsApp-based onboarding flow.
 * Collects company info through a conversation, then saves to memory.
 */
export class OnboardingFlow {
  private memory: MemoryStore;

  constructor(memory: MemoryStore) {
    this.memory = memory;
  }

  isOnboarding(chatId: string): boolean {
    return onboardingStates.has(chatId);
  }

  startOnboarding(chatId: string): string {
    onboardingStates.set(chatId, { step: "company_name" });
    return `Welcome to *Journeyman*! I'm Atlas, your AI Chief of Staff.

Before I can start working for you, I need to learn about your company. This will take less than a minute.

What's your company name?`;
  }

  async processStep(chatId: string, message: string): Promise<{ response: string; complete: boolean }> {
    const state = onboardingStates.get(chatId);
    if (!state) {
      return { response: this.startOnboarding(chatId), complete: false };
    }

    switch (state.step) {
      case "company_name":
        state.companyName = message.trim();
        state.step = "industry";
        return {
          response: `Great, *${state.companyName}*! What industry are you in?\n\n(e.g., Technology, E-commerce, Professional Services, Healthcare, Finance, Real Estate, or describe it)`,
          complete: false,
        };

      case "industry":
        state.industry = message.trim();
        state.step = "description";
        return {
          response: `Got it. Last question: what kind of work do you need help with?\n\n(e.g., "customer support on WhatsApp", "market research", "content creation", "operations management")`,
          complete: false,
        };

      case "description":
        state.description = message.trim();
        state.step = "complete";

        // Save everything to memory
        await this.memory.saveMemory(
          `Company name: ${state.companyName}`,
          "fact"
        );
        await this.memory.saveMemory(
          `Industry: ${state.industry}`,
          "fact"
        );
        await this.memory.saveMemory(
          `Primary needs: ${state.description}`,
          "fact"
        );
        await this.memory.saveMemory(
          `Onboarded on ${new Date().toISOString().split("T")[0]}`,
          "fact"
        );

        onboardingStates.delete(chatId);

        return {
          response: `Onboarding complete! Here's what I know:

*Company:* ${state.companyName}
*Industry:* ${state.industry}
*Focus:* ${state.description}

I'm Atlas, your AI Chief of Staff. I'm ready to work. You can:
- Assign me tasks ("research X", "draft a message to Y")
- Ask me questions about anything
- Say "tasks" to see your task board
- Say "memory" to see what I remember

What would you like me to work on first?`,
          complete: true,
        };

      default:
        onboardingStates.delete(chatId);
        return { response: this.startOnboarding(chatId), complete: false };
    }
  }
}
